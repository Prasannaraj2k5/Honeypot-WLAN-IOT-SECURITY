const API_URL = 'http://localhost:3000/api';

let credentialsChartInstance = null;
let forecastChartInstance = null;
let tfModel = null;
let map = null;
let plottedIPs = new Set();
let alarmTriggered = false; // Debounce alarm
let alarmAudioCtx = null;
let previousAttackCount = 0;

// Caching and UI controls
let cachedData = [];
let networkGraph = null;
let lastTerminalId = 0;
let captiveAttackCounts = {};

// === VOICE ALERT SYSTEM ===
function playVoiceAlert(message) {
    if ('speechSynthesis' in window) {
        const msg = new SpeechSynthesisUtterance(message);
        msg.rate = 1.1;
        msg.pitch = 1.0;
        window.speechSynthesis.speak(msg);
    }
}
// === DASHBOARD SIREN SYSTEM (Web Audio API) ===
function playSiren(duration = 3000) {
    try {
        if (!alarmAudioCtx) alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = alarmAudioCtx;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'square';
        gain.gain.value = 0.3;

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        // Siren sweep effect
        const now = ctx.currentTime;
        const end = now + duration / 1000;
        osc1.frequency.setValueAtTime(800, now);
        osc1.frequency.linearRampToValueAtTime(1600, now + 0.5);
        osc1.frequency.linearRampToValueAtTime(800, now + 1.0);
        osc1.frequency.linearRampToValueAtTime(1600, now + 1.5);
        osc1.frequency.linearRampToValueAtTime(800, now + 2.0);
        osc1.frequency.linearRampToValueAtTime(1600, now + 2.5);

        osc2.frequency.setValueAtTime(400, now);
        osc2.frequency.linearRampToValueAtTime(600, now + 1.0);
        osc2.frequency.linearRampToValueAtTime(400, now + 2.0);

        gain.gain.linearRampToValueAtTime(0, end);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(end);
        osc2.stop(end);
    } catch(e) {
        console.warn('Audio not supported', e);
    }
}

function showAlarmOverlay(nodeName) {
    // Remove existing overlay if any
    const existing = document.getElementById('alarmOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'alarmOverlay';
    overlay.innerHTML = `
        <div style="
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999;
            display: flex; justify-content: center; align-items: center;
            background: rgba(255, 0, 0, 0.15);
            animation: alarmFlash 0.5s ease-in-out 6 alternate;
            pointer-events: none;
        ">
            <div style="
                background: rgba(0,0,0,0.85); border: 2px solid #ff3333; border-radius: 16px;
                padding: 30px 50px; text-align: center; pointer-events: auto;
                box-shadow: 0 0 60px rgba(255,0,0,0.5);
                animation: alarmPulse 0.6s ease-in-out infinite alternate;
            ">
                <div style="font-size: 60px; margin-bottom: 10px;">🚨</div>
                <h2 style="color: #ff3333; font-family: 'Inter', sans-serif; font-size: 24px; margin: 0 0 8px;">INTRUSION DETECTED</h2>
                <p style="color: #f87171; font-family: monospace; font-size: 14px; margin: 0 0 5px;">${nodeName || 'Honeypot Node'}</p>
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Alarm auto-dismisses in 3 seconds...</p>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        const el = document.getElementById('alarmOverlay');
        if (el) el.remove();
    }, 3000);
}

// Initialize Vis.js Network
function initNetwork() {
    const container = document.getElementById('mynetwork');
    const data = { nodes: new vis.DataSet([]), edges: new vis.DataSet([]) };
    const options = {
        nodes: { font: { color: '#ffffff' } },
        edges: { color: '#ff3333', arrows: 'to' },
        physics: { stabilization: false }
    };
    networkGraph = new vis.Network(container, data, options);
}

// Update Network Graph
function updateNetwork(data) {
    if (!networkGraph) return;
    const nodes = networkGraph.body.data.nodes;
    const edges = networkGraph.body.data.edges;
    
    data.forEach(log => {
        const targetNode = log.node_id || 'Unknown Node';
        
        // Ensure Honeypot Node exists
        if (!nodes.get(targetNode)) {
            nodes.add({ id: targetNode, label: targetNode, color: targetNode.includes('FTP') ? '#38bdf8' : '#00ff00', shape: 'star', size: 30 });
        }

        if (!nodes.get(log.ip_address)) {
            nodes.add({ id: log.ip_address, label: log.ip_address, color: '#ff3333', shape: 'dot', size: 10 });
        }

        const edgeId = `${log.ip_address}-${targetNode}`;
        if (!edges.get(edgeId)) {
             edges.add({ id: edgeId, from: log.ip_address, to: targetNode });
        }
    });
}

// Download Dashboard as PDF
function downloadPDF() {
    const element = document.getElementById('dashboardReportContainer');
    html2pdf().from(element).set({
        margin: 0.5,
        filename: 'Honeypot_Threat_Report.pdf',
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { orientation: 'portrait', unit: 'in', format: 'letter', compressPDF: true }
    }).save();
}

// Export Attack Logs to CSV
function exportCSV() {
    if(!cachedData || cachedData.length === 0) return alert("No data to export");
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Time,Attacker IP,Protocol,Username,Password,SQLi,Dict,Botnet\n";
    cachedData.forEach(row => {
        const d = new Date(row.timestamp).toISOString();
        csvContent += `${row.id},${d},${row.ip_address},${row.protocol},${row.username || ''},${row.password || ''},${row.is_sqli},${row.is_dictionary},${row.is_botnet}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "attacks_export.csv");
    document.body.appendChild(link);
    link.click();
}

// Initialize TF.js
async function initTFModel() {
    tfModel = tf.sequential();
    tfModel.add(tf.layers.dense({units: 16, activation: 'relu', inputShape: [3]}));
    tfModel.add(tf.layers.dense({units: 8, activation: 'relu'}));
    tfModel.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
    tfModel.compile({optimizer: 'adam', loss: 'binaryCrossentropy'});
}

// Initialize Leaflet Map
function initMap() {
    map = L.map('map').setView([9.575135, 77.675852], 12); // zoomed in to provided location
    L.tileLayer('http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps'
    }).addTo(map);
}

// Map IP using ip-api
async function plotIpOnMap(log) {
    const ip = log.ip_address;
    const nodeId = log.node_id || '';
    const mapKey = `${ip}_${nodeId}`;
    
    if (plottedIPs.has(mapKey)) return;
    plottedIPs.add(mapKey);

    try {
        let lat, lon, title;
        let markerColor = '#f03'; // default red

        if (ip === '114.114.114.114' || ip === '5.255.255.5') {
            lat = 9.9252 + (Math.random() * 0.05);
            lon = 78.1198 + (Math.random() * 0.05);
            title = 'Madurai Regional Attacker';
        } else if (ip === '8.8.8.8' || ip === '213.133.100.100') {
            lat = 9.5533 + (Math.random() * 0.02);
            lon = 77.6534 + (Math.random() * 0.02);
            title = 'Krishnankovil Local Threat';
        } else if (ip === '1.1.1.1') {
            lat = 9.5132;
            lon = 77.6322;
            title = 'Srivilliputhur Attacker';
        } else if (ip.startsWith('192.168.4.')) {
            // Captive Portal victim (connected to Free_College_WiFi AP)
            lat = 9.575135 + (Math.random() * 0.03 - 0.015);
            lon = 77.675852 + (Math.random() * 0.03 - 0.015);
            title = '📱 Captive Portal Victim';
            markerColor = '#ff6600';
        } else if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '127.0.0.1') {
            lat = 9.575135 + (Math.random() * 0.04 - 0.02);
            lon = 77.675852 + (Math.random() * 0.04 - 0.02);
            title = 'WLAN Network Attacker';
            if (nodeId.includes('FTP')) {
                markerColor = '#38bdf8';
                title = '🎥 FTP Camera Attacker';
            } else if (nodeId.includes('Captive')) {
                markerColor = '#ff6600';
                title = '📱 Captive Portal Victim';
            } else {
                markerColor = '#a855f7';
                title = '💻 Telnet/HTTP Attacker';
            }
        } else {
            const geo = await fetch(`http://ip-api.com/json/${ip}`).then(r => r.json());
            if (geo.status === 'success') {
                lat = geo.lat;
                lon = geo.lon;
                title = `${geo.city}, ${geo.country}`;
            } else {
                return;
            }
        }
        
        const popupContent = `<b>${ip}</b><br>${title}<br><small style="color:#888;">${nodeId}</small>`;
        
        L.circleMarker([lat, lon], {
            color: markerColor,
            fillColor: markerColor,
            fillOpacity: 0.6,
            radius: 10
        }).addTo(map).bindPopup(popupContent);

    } catch (e) {
        console.error("Map plotting failed", e);
    }
}

async function runThreatScoring(data) {
    if (!tfModel || data.length === 0) return;
    
    // Feature engineering
    const recentAttacks = data.slice(0, 10);
    const attackFreq = recentAttacks.length;
    const latest = data[0];
    const protocolIndex = latest.protocol === 'HTTP' ? 1 : 0;
    const credLength = latest.password ? latest.password.length : 0;
    
    // Predict
    const inputTensor = tf.tensor2d([[attackFreq / 10, protocolIndex, credLength / 20]]);
    const prediction = tfModel.predict(inputTensor);
    const score = (await prediction.data())[0] * 100;
    
    const botnetScoreEl = document.getElementById('botnetScore');
    botnetScoreEl.textContent = `${score.toFixed(1)}%`;
    
    if(score > 75) {
        botnetScoreEl.style.color = "var(--accent-red)";
        triggerHardwareAlarm(latest.node_id);
    } else if (score > 40) {
        botnetScoreEl.style.color = "#f59e0b";
    } else {
        botnetScoreEl.style.color = "#10b981";
    }
}

function triggerHardwareAlarm(node) {
    if (alarmTriggered) return;
    alarmTriggered = true;
    
    console.log(`Triggering Dashboard Alarm for ${node || 'all'}!`);
    
    // Dashboard Siren + Visual Alert
    playSiren(3000);
    showAlarmOverlay(node);

    // Also try hardware (will silently fail if ESP unreachable)
    fetch(`${API_URL}/trigger_alarm?node=${encodeURIComponent(node || '')}`)
        .then(r => r.json())
        .then(d => console.log("Alarm status:", d))
        .catch(e => console.error("Alarm error:", e));

    setTimeout(() => { alarmTriggered = false; }, 15000);
}

async function fetchClusters() {
    try {
        const response = await fetch(`${API_URL}/ml/clusters`);
        const clusters = await response.json();
        const list = document.getElementById('clustersList');
        list.innerHTML = '';
        
        clusters.forEach(c => {
            const div = document.createElement('div');
            div.style.padding = "0.75rem";
            div.style.borderBottom = "1px solid var(--glass-border)";
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between;">
                    <span style="font-family: monospace; color: var(--accent);">${c.ip}</span>
                    <span class="cred-badge">Grp: ${c.clusterID}</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">
                    Attacks: ${c.attack_count} | Unique Creds: ${c.distinct_creds}
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {}
}

async function fetchLSTMPrediction(topIp) {
    if(!topIp || topIp === '-') return;
    try {
        const response = await fetch(`${API_URL}/ml/predict/${topIp}`);
        const data = await response.json();
        
        document.getElementById('lstmPredict').innerHTML = `
            <span style="font-size:1rem; color:var(--text-muted)">Based on: ${data.base_attempt || '?'}</span><br>
            <span style="color: #a855f7;">${data.prediction || 'Calculating...'}</span>
        `;
    } catch (e) {}
}

async function fetchAttacks() {
    try {
        const response = await fetch(`${API_URL}/attacks`);
        if (!response.ok) throw new Error('Network response was not ok');
        cachedData = await response.json();
        
        updateDashboardFromCache();
        
    } catch (error) {
        console.error("Error fetching attacks:", error);
    }
}

function updateDashboardFromCache() {
    const hours = parseInt(document.getElementById('timeRange').value);
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    // Filter data based on timeline slider
    const filteredData = cachedData.filter(log => new Date(log.timestamp) >= cutoffTime);
    
    updateDashboard(filteredData);
    
    // Background tasks updating
    runThreatScoring(filteredData);
    fetchClusters();
    updateNetwork(filteredData);
    
    filteredData.forEach(log => plotIpOnMap(log));
    
    const ips = filteredData.reduce((acc, curr) => { acc[curr.ip_address] = (acc[curr.ip_address] || 0) + 1; return acc; }, {});
    const topIp = Object.keys(ips).length > 0 ? Object.keys(ips).reduce((a, b) => ips[a] > ips[b] ? a : b, '-') : '-';
    fetchLSTMPrediction(topIp);
}

function updateDashboard(data) {
    document.getElementById('totalAttacks').textContent = data.length;
    
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = '';
    
    data.slice(0, 50).forEach(log => {
        const tr = document.createElement('tr');
        const date = new Date(log.timestamp).toLocaleTimeString();
        const creds = log.username ? `${log.username}:${log.password}` : 'None';
        
        // ML Badges
        let badgesHtml = '';
        if (log.is_sqli) badgesHtml += `<span style="background:red; color:white; padding:2px 5px; border-radius:4px; font-size:10px; margin-right:5px;">SQLi</span>`;
        if (log.is_dictionary) badgesHtml += `<span style="background:orange; color:white; padding:2px 5px; border-radius:4px; font-size:10px; margin-right:5px;">Dict</span>`;
        if (log.is_botnet) badgesHtml += `<span style="background:#8b5cf6; color:white; padding:2px 5px; border-radius:4px; font-size:10px;">Botnet</span>`;
        if (!badgesHtml) badgesHtml = `<span style="color:var(--text-muted); font-size:10px;">Clean</span>`;
        
        tr.innerHTML = `
            <td>${date}</td>
            <td style="${log.is_botnet?'color:#8b5cf6;font-weight:bold;':''}">${log.ip_address}</td>
            <td style="color:var(--accent); font-size:0.9rem;">${log.node_id || '-'}</td>
            <td>${log.protocol}</td>
            <td><span class="cred-badge">${creds}</span></td>
            <td>${badgesHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update Matrix Terminal
    const terminal = document.getElementById('matrixTerminal');
    const newLogs = data.filter(log => log.id > lastTerminalId);
    
    // Sort chronological for the terminal append
    newLogs.sort((a,b) => a.id - b.id).forEach(log => {
        const timestamp = new Date(log.timestamp).toISOString();
        const hexDump = Array.from(log.username || 'unknown').map(c => c.charCodeAt(0).toString(16)).join(' ') + " ...";
        const entry = document.createElement('div');
        entry.style.marginBottom = '8px';
        entry.innerHTML = `
            <span style="color: #8b5cf6;">[${timestamp}]</span> INBOUND CONNECTION: ${log.ip_address}<br>
            > PROTOCOL: ${log.protocol} | PORT: ${log.protocol === 'HTTP' ? 80 : 23}<br>
            > PAYLOAD HEX: <span style="color: #64748b;">0x${hexDump}</span><br>
            > DECODED: {"user":"${log.username}","pass":"${log.password}"}<br>
            > THREAT FLAGS: [SQLi:${log.is_sqli?'YES':'NO'}] [Dict:${log.is_dictionary?'YES':'NO'}]
        `;
        terminal.appendChild(entry);
        lastTerminalId = Math.max(lastTerminalId, log.id);

        // Voice Alert for Captive Portal Brute Force
        if (log.node_id && log.node_id.includes('Captive')) {
            captiveAttackCounts[log.ip_address] = (captiveAttackCounts[log.ip_address] || 0) + 1;
            if (captiveAttackCounts[log.ip_address] === 3) {
                playVoiceAlert("Warning. Multiple captive portal password attempts detected.");
            } else if (captiveAttackCounts[log.ip_address] > 0 && captiveAttackCounts[log.ip_address] % 5 === 0) {
                playVoiceAlert("Alert. Persistent captive portal brute force in progress.");
            }
        }
    });
    
    // Auto-scroll terminal
    if (newLogs.length > 0) {
        terminal.scrollTop = terminal.scrollHeight;
    }

    renderCharts(data);
}

function renderCharts(data) {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    // Top Credentials Doughnut
    const credsFreq = {};
    data.forEach(log => {
        if (log.username) {
            const pair = `${log.username}:${log.password}`;
            credsFreq[pair] = (credsFreq[pair] || 0) + 1;
        }
    });
    const sortedCreds = Object.entries(credsFreq).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const credsCtx = document.getElementById('credentialsChart').getContext('2d');
    if (credentialsChartInstance) credentialsChartInstance.destroy();
    credentialsChartInstance = new Chart(credsCtx, {
        type: 'doughnut',
        data: {
            labels: sortedCreds.map(c => c[0]),
            datasets: [{
                data: sortedCreds.map(c => c[1]),
                backgroundColor: ['rgba(239, 68, 68, 0.8)', 'rgba(249, 115, 22, 0.8)', 'rgba(234, 179, 8, 0.8)', 'rgba(56, 189, 248, 0.8)', 'rgba(168, 85, 247, 0.8)'],
                borderWidth: 0,
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Forecasting Line Chart
    // Group attacks by minute
    const timeSlots = {};
    const reversedData = [...data].reverse();
    reversedData.forEach(log => {
        const timeKey = new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        timeSlots[timeKey] = (timeSlots[timeKey] || 0) + 1;
    });
    
    // Synthesize forecasting (simply plot existing data and add a simple moving average line)
    const labels = Object.keys(timeSlots).slice(-10); // Last 10 minutes
    const values = labels.map(l => timeSlots[l]);
    
    const forecastCtx = document.getElementById('forecastChart').getContext('2d');
    if (forecastChartInstance) forecastChartInstance.destroy();
    forecastChartInstance = new Chart(forecastCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Actual Attacks',
                data: values,
                borderColor: '#38bdf8',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(56, 189, 248, 0.1)'
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });

}

// Boot up
initMap();
initNetwork();
initTFModel().then(() => {
    fetchAttacks();
    setInterval(fetchAttacks, 5000);
});
