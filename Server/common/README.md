# Common

Shared utilities and configurations used across all services.

## Structure

```
common/
├── config.js          # Environment configuration
├── logger.js          # Winston logger
├── metrics.js         # Prometheus metrics (placeholder)
├── errors/            # Custom error classes
└── utils/             # Utility functions
```

## Files

### `config.js`

Centralized configuration from environment variables:

```javascript
module.exports = {
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'task_scheduler',
        user: process.env.DB_USER || 'user',
        password: process.env.DB_PASSWORD || 'password'
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
    },
    etcd: {
        hosts: process.env.ETCD_HOSTS || 'http://localhost:2379'
    },
    scheduler: {
        dispatchInterval: parseInt(process.env.DISPATCH_INTERVAL) || 1000,
        retryInterval: parseInt(process.env.RETRY_INTERVAL) || 5000
    },
    api: {
        port: parseInt(process.env.API_PORT) || 3000
    }
};
```

**Usage:**
```javascript
const config = require('./common/config');
console.log(config.db.host);
```

### `logger.js`

Winston-based structured logging:

```javascript
const logger = require('./common/logger');

logger.info('Task created', { taskId: 'abc-123' });
logger.error('Task failed', { taskId: 'abc-123', error: err.message });
logger.warn('DLQ size critical', { count: 150 });
```

**Features:**
- JSON format for easy parsing
- Timestamp on every log
- Service name included
- Different log levels (info, warn, error)

**Output Example:**
```json
{
  "level": "info",
  "message": "Task created",
  "taskId": "abc-123",
  "service": "task-scheduler",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### `metrics.js`

Prometheus metrics placeholder:

```javascript
const metrics = require('./common/metrics');

// Increment counter
metrics.tasksCreated.inc();

// Observe histogram
metrics.taskDuration.observe(executionTime);
```

**Note:** Currently a placeholder. In production, would export metrics to Prometheus.

## Errors

### `custom-errors.js`

Custom error classes for better error handling:

```javascript
const { NotFoundError, ConflictError } = require('./common/errors/custom-errors');

// Throw custom errors
throw new NotFoundError('Task not found');
throw new ConflictError('Duplicate idempotency key');
```

**Error Classes:**
- `NotFoundError` - Resource not found (404)
- `ConflictError` - Duplicate resource (409)
- `ValidationError` - Invalid input (400)

## Utils

### `uuid.js`

UUID generation:

```javascript
const { generateId } = require('./common/utils/uuid');

const taskId = generateId();
// Example: "abc-123-def-456-ghi-789"
```

Uses `uuid` library for RFC4122 compliant UUIDs.

## Design Principles

1. **DRY** - Don't repeat configuration across services
2. **Centralized** - Single source of truth for config
3. **Environment-Based** - All config from env vars
4. **Structured Logging** - JSON format for observability
5. **Type Safety** - Validate and parse env vars

## Usage Example

```javascript
// In any service
const config = require('../common/config');
const logger = require('../common/logger');
const { generateId } = require('../common/utils/uuid');

const taskId = generateId();
logger.info('Creating task', { taskId });

const db = new Pool(config.db);
```

## Environment Variables

See `../../.env` for all configuration options.

**Required:**
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `REDIS_HOST`, `REDIS_PORT`
- `ETCD_HOSTS`

**Optional (with defaults):**
- `API_PORT` (default: 3000)
- `DISPATCH_INTERVAL` (default: 1000ms)
- `RETRY_INTERVAL` (default: 5000ms)
