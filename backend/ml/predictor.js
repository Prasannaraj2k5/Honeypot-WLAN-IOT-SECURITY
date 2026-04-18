const db = require('../database');

function predictNextCredential(ip, callback) {
    db.all(`
        SELECT username, password 
        FROM attacks 
        WHERE ip_address = ? 
        ORDER BY timestamp ASC
    `, [ip], (err, rows) => {
        if (err || rows.length < 2) return callback(null, { prediction: "Not enough data" });

        // Placeholder for LSTM (bypassed native build for windows environment demo)
        const sequences = rows.map(r => (r.password || "").toLowerCase());
        const lastAttempt = sequences[sequences.length - 1];

        // Mock predicting the sequential next integer if they are brute forcing
        let nextPrediction = "Unknown";
        if (lastAttempt && lastAttempt.match(/\d+$/)) {
            const numStr = lastAttempt.match(/\d+$/)[0];
            const nextNum = parseInt(numStr) + 1;
            nextPrediction = lastAttempt.replace(/\d+$/, nextNum);
        } else if (lastAttempt) {
            nextPrediction = lastAttempt + "123";
        }

        callback(null, { 
            base_attempt: lastAttempt,
            prediction: `[Simulated LSTM] ${nextPrediction}` 
        });
    });
}

module.exports = { predictNextCredential };
