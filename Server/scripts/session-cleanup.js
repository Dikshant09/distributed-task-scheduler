/**
 * Session Cleanup Job
 * Runs continuously to clean expired sessions (30-minute TTL)
 */
const { Pool } = require('pg');
const Redis = require('ioredis');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function cleanup() {
    const startTime = Date.now();
    console.log(`[Cleanup] Starting session cleanup at ${new Date().toISOString()}`);

    try {
        // Get expired session IDs
        const { rows } = await pool.query(`
      SELECT DISTINCT session_id FROM tasks 
      WHERE expires_at < NOW()
      LIMIT 100
    `);

        if (rows.length === 0) {
            console.log('[Cleanup] No expired sessions found');
            return;
        }

        const expiredSessionIds = rows.map(r => r.session_id);
        console.log(`[Cleanup] Found ${expiredSessionIds.length} expired sessions`);

        // Delete from PostgreSQL
        for (const sessionId of expiredSessionIds) {
            await pool.query('DELETE FROM tasks WHERE session_id = $1', [sessionId]);
            await pool.query('DELETE FROM jobs WHERE session_id = $1', [sessionId]);
            await pool.query('DELETE FROM events WHERE session_id = $1', [sessionId]);

            // Delete from Redis using SCAN (non-blocking)
            const stream = redis.scanStream({ match: `*:${sessionId}:*`, count: 100 });
            for await (const keys of stream) {
                if (keys.length > 0) {
                    await redis.del(...keys);
                }
            }
        }

        // Also clean old events without session_id (legacy)
        await pool.query(`
      DELETE FROM events 
      WHERE created_at < NOW() - INTERVAL '30 minutes'
    `);

        const duration = Date.now() - startTime;
        console.log(`[Cleanup] Completed in ${duration}ms. Removed ${expiredSessionIds.length} sessions.`);

    } catch (error) {
        console.error('[Cleanup] Error during cleanup:', error.message);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Cleanup] Received SIGTERM, shutting down...');
    await pool.end();
    redis.disconnect();
    process.exit(0);
});

// Run cleanup loop
console.log('[Cleanup] Session cleanup service started');
console.log(`[Cleanup] Will run every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes`);

cleanup(); // Run immediately on start
setInterval(cleanup, CLEANUP_INTERVAL_MS);
