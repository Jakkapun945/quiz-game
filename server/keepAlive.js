const cron = require('node-cron');
const http = require('http');
const https = require('https');

function initKeepAlive() {
    const selfUrl = process.env.SELF_URL;
    
    if (!selfUrl || selfUrl.includes('localhost')) {
        console.log('ℹ️ Local development detected. Keep-alive cron ping is disabled.');
        return;
    }

    console.log(`🏥 Initializing Keep-Alive Cron job for: ${selfUrl} (every 14 mins)`);

    // Run every 14 minutes: '*/14 * * * *'
    cron.schedule('*/14 * * * *', () => {
        const client = selfUrl.startsWith('https') ? https : http;
        const targetEndpoint = `${selfUrl.replace(/\/$/, '')}/health`;

        console.log(`[KeepAlive Ping] Sending ping to ${targetEndpoint} at ${new Date().toISOString()}`);

        client.get(targetEndpoint, (res) => {
            console.log(`[KeepAlive Ping] Success. Status Code: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error(`[KeepAlive Ping] Failed:`, err.message);
        });
    });
}

module.exports = initKeepAlive;
