const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'attacks.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`DROP TABLE IF EXISTS attacks`);
    db.run(`
        CREATE TABLE IF NOT EXISTS attacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            node_id TEXT,
            ip_address TEXT,
            protocol TEXT,
            username TEXT,
            password TEXT
        )
    `);
});

module.exports = db;
