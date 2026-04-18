const http = require('http');

const BACKEND_URL = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/report',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
};

const attackPayloads = [
    { username: 'admin', password: 'password', ip: '114.114.114.114', protocol: 'HTTP' }, // China
    { username: 'root', password: '123', ip: '8.8.8.8', protocol: 'Telnet' }, // US
    { username: 'admin', password: 'admin1', ip: '1.1.1.1', protocol: 'HTTP' }, // Aus
    { username: 'admin', password: 'admin2', ip: '1.1.1.1', protocol: 'HTTP' },
    { username: 'admin', password: 'admin3', ip: '1.1.1.1', protocol: 'HTTP' }, 
    { username: 'admin', password: 'admin4', ip: '1.1.1.1', protocol: 'HTTP' },
    { username: 'user', password: 'user', ip: '213.133.100.100', protocol: 'Telnet' }, // Germany
    { username: 'service', password: 'service', ip: '5.255.255.5', protocol: 'HTTP' } // Russia
];

let i = 0;
function sendMockData() {
    if (i >= attackPayloads.length * 5) {
        console.log("Mock data injection complete.");
        return;
    }

    const payload = attackPayloads[i % attackPayloads.length];
    
    const req = http.request(BACKEND_URL, (res) => {
        console.log(`Injected: ${payload.username}:${payload.password} from ${payload.ip}`);
        i++;
        setTimeout(sendMockData, 200);
    });

    req.write(JSON.stringify(payload));
    req.end();
}

console.log("Injecting mock botnet traffic into Backend...");
sendMockData();
