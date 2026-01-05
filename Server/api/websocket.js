const { Server } = require('socket.io');
const db = require('../db');
const eventLogger = require('../common/event-logger');
const logger = require('../common/logger');

let io = null;

/**
 * Initialize WebSocket server
 * @param {http.Server} httpServer - HTTP server instance
 */
function initializeWebSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: 'http://localhost:5173',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        logger.info(`WebSocket client connected: ${socket.id}`);

        // Send initial data on connection
        sendSystemUpdate(socket);

        socket.on('disconnect', () => {
            logger.info(`WebSocket client disconnected: ${socket.id}`);
        });
    });

    // Broadcast system updates every 2 seconds
    setInterval(async () => {
        await broadcastSystemUpdate();
    }, 2000);

    logger.info('WebSocket server initialized');
}

/**
 * Get all schedulers from database
 */
async function getAllSchedulers() {
    const result = await db.query(`
        SELECT id, pid, is_leader as "isLeader", started_at as "startedAt"
        FROM process_instances
        WHERE type = 'scheduler'
        ORDER BY started_at ASC
    `);
    return result.rows;
}

/**
 * Get all workers from database
 */
async function getAllWorkers() {
    const result = await db.query(`
        SELECT id, pid, status, current_task_id as "currentTaskId", started_at as "startedAt"
        FROM process_instances
        WHERE type = 'worker'
        ORDER BY started_at ASC
    `);
    return result.rows;
}

/**
 * Send system update to a specific socket
 */
async function sendSystemUpdate(socket) {
    try {
        const schedulers = await getAllSchedulers();
        const workers = await getAllWorkers();
        const events = await eventLogger.getRecent(10);

        socket.emit('system:update', {
            schedulers,
            workers,
            events,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        logger.error('Failed to send system update', err);
    }
}

/**
 * Broadcast system update to all connected clients
 */
async function broadcastSystemUpdate() {
    if (!io) return;

    try {
        const schedulers = await getAllSchedulers();
        const workers = await getAllWorkers();
        const events = await eventLogger.getRecent(10);

        io.emit('system:update', {
            schedulers,
            workers,
            events,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        logger.error('Failed to broadcast system update', err);
    }
}

/**
 * Emit event to all connected clients
 */
function emitEvent(eventType, eventData) {
    if (!io) return;

    io.emit('event:new', {
        type: eventType,
        data: eventData,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit instance update (scheduler/worker status change)
 */
async function emitInstanceUpdate() {
    if (!io) return;

    try {
        const schedulers = await getAllSchedulers();
        const workers = await getAllWorkers();

        io.emit('instances:update', {
            schedulers,
            workers,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        logger.error('Failed to emit instance update', err);
    }
}

module.exports = {
    initializeWebSocket,
    emitEvent,
    emitInstanceUpdate,
    getIO: () => io
};
