const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

let activeNodes = {};

// Endpoint for ESP32 to submit attack logs
app.post('/api/report', (req, res) => {
    // Capture the ESP32's actual IP address
    let payloadIP = req.ip.includes('::ffff:') ? req.ip.split('::ffff:')[1] : req.ip;
    if (payloadIP === '127.0.0.1' || payloadIP === '::1') payloadIP = '192.168.1.100'; // fallback if ran via localhost proxy tester

    const { ip, protocol, username, password, node_id } = req.body;
    const finalNodeId = node_id || 'Node-1 (Default)';
    
    // Remember this node's IP for alarms
    activeNodes[finalNodeId] = payloadIP;

    if (!ip || !protocol) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const stmt = db.prepare("INSERT INTO attacks (node_id, ip_address, protocol, username, password) VALUES (?, ?, ?, ?, ?)");
    stmt.run(finalNodeId, ip, protocol, username || '', password || '', function(err) {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        res.status(201).json({ success: true, id: this.lastID });
    });
    stmt.finalize();
});

// Endpoint for Dashboard to trigger ESP32 Hardware Alarm
app.get('/api/trigger_alarm', (req, res) => {
    const targetNode = req.query.node;
    let targetIP = targetNode ? activeNodes[targetNode] : Object.values(activeNodes)[0];

    if (!targetIP) return res.status(400).json({ error: "Target Node IP Unknown" });
    
    const http = require('http');
    const options = {
        hostname: targetIP,
        port: 80,
        path: '/alarm',
        method: 'POST'
    };

    const alarmReq = http.request(options, (alarmRes) => {
        res.json({ success: true, target_node: targetNode || 'Default', esp_ip: targetIP });
    });

    alarmReq.on('error', (e) => {
        res.status(500).json({ error: "Failed to reach ESP32", message: e.message });
    });

    alarmReq.end();
});

const mlClusters = require('./ml/clusters');
const mlPredictor = require('./ml/predictor');

const DICT_PASSWORDS = ['admin', '12345', '123456', 'password', 'root', '1234'];

function isSQLi(str) {
    if (!str) return false;
    const sqliRegex = /('|OR|--|;|SELECT|UNION|INSERT|DROP|UPDATE)/i;
    return sqliRegex.test(str);
}

// Endpoint for Dashboard to fetch attack logs
app.get('/api/attacks', (req, res) => {
    db.all("SELECT * FROM attacks ORDER BY timestamp DESC LIMIT 100", (err, rows) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        
        const ipCounts = {};
        rows.forEach(r => ipCounts[r.ip_address] = (ipCounts[r.ip_address] || 0) + 1);

        const analyzedRows = rows.map(row => {
            return {
                ...row,
                is_sqli: isSQLi(row.username) || isSQLi(row.password),
                is_dictionary: DICT_PASSWORDS.includes(row.password),
                is_botnet: ipCounts[row.ip_address] > 5
            };
        });

        res.json(analyzedRows);
    });
});

// ML: Get K-Means Clusters
app.get('/api/ml/clusters', (req, res) => {
    mlClusters.getClusters((err, data) => {
        if (err) return res.status(500).json({ error: "ML error" });
        res.json(data);
    });
});

// ML: Predict Next Credential using LSTM
app.get('/api/ml/predict/:ip', (req, res) => {
    mlPredictor.predictNextCredential(req.params.ip, (err, data) => {
        if (err) return res.status(500).json({ error: "ML error" });
        res.json(data);
    });
});

app.listen(PORT, () => {
    console.log(`[Honeypot Backend] Server running on http://localhost:${PORT}`);
});
