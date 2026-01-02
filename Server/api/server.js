const express = require('express');
const cors = require('cors');
const config = require('../common/config');
const logger = require('../common/logger');
const requestLogger = require('./middlewares/request-id');
const errorHandler = require('./middlewares/error-handler');

// Routes
const jobRoutes = require('./routes/jobs.routes');
const healthRoutes = require('./routes/health.routes');
const workerRoutes = require('./routes/workers.routes');
const systemRoutes = require('./routes/system.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Mount Routes
app.use('/health', healthRoutes);
app.use('/tasks', jobRoutes);
app.use('/workers', workerRoutes);
app.use('/system', systemRoutes);
app.use('/admin', adminRoutes);

// Error Handler
app.use(errorHandler);

// Start Server
if (require.main === module) {
    app.listen(config.server.port, () => {
        logger.info(`API Service running on port ${config.server.port}`);
    });
}

module.exports = app;
