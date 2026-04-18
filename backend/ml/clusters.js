const kmeans = require('ml-kmeans');
const db = require('../database');

function getClusters(callback) {
    db.all(`
        SELECT ip_address, 
               COUNT(*) as attack_count, 
               COUNT(DISTINCT username || ':' || password) as distinct_creds
        FROM attacks
        GROUP BY ip_address
    `, (err, rows) => {
        if (err) return callback(err, null);
        if (rows.length === 0) return callback(null, []);

        // Prepare data for K-Means
        const data = rows.map(r => [r.attack_count, r.distinct_creds]);
        
        // Let's create max 3 clusters
        const numClusters = Math.min(data.length, 3);
        const ans = kmeans(data, numClusters, { initialization: 'kmeans++' });
        
        // Map back to IPs
        const riskLevels = ["Low", "Medium", "High"]; // Simplistic labeling based on cluster index size
        
        const results = rows.map((r, i) => ({
            ip: r.ip_address,
            attack_count: r.attack_count,
            distinct_creds: r.distinct_creds,
            clusterID: ans.clusters[i],
            assignedRisk: "Unknown" // Can sort cluster centroids to assign risk better, simple mapping here
        }));

        callback(null, results);
    });
}

module.exports = { getClusters };
