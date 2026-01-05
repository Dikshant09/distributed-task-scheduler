const express = require('express');
const http = require('http');
const cors = require('cors');
const config = require('../common/config');
const logger = require('../common/logger');
const requestLogger = require('./middlewares/request-id');
const errorHandler = require('./middlewares/error-handler');
const { initializeWebSocket } = require('./websocket');

// Routes
const jobRoutes = require('./routes/jobs.routes');
const healthRoutes = require('./routes/health.routes');
const workerRoutes = require('./routes/workers.routes');
const systemRoutes = require('./routes/system.routes');
const adminRoutes = require('./routes/admin.routes');
const instancesRoutes = require('./routes/instances.routes');
const eventsRoutes = require('./routes/events.routes');

const app = express();
const httpServer = http.createServer(app);

// Initialize WebSocket
initializeWebSocket(httpServer);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Mount Routes
app.use('/health', healthRoutes);
app.use('/tasks', jobRoutes);
app.use('/workers', workerRoutes);
app.use('/system', systemRoutes);
app.use('/instances', instancesRoutes);
app.use('/admin', adminRoutes);
app.use('/events', eventsRoutes);

// Error Handler
app.use(errorHandler);

// Start Server
if (require.main === module) {
    httpServer.listen(config.server.port, () => {
        logger.info(`API Service running on port ${config.server.port}`);
        logger.info('WebSocket server ready for connections');
    });
}

module.exports = app;
