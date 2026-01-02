# API

REST API for the Distributed Task Scheduler (Control Plane).

## Purpose

Accept user intent, validate job payloads, and persist to database.

**Key Principle:** The API does NOT dispatch jobs. It only accepts and stores them. The Scheduler service handles time-based dispatch.

## Structure

```
api/
├── controllers/      # Request handlers
├── routes/          # Route definitions
├── middleware/      # Request middleware
└── server.js        # Express app entry point
```

## Endpoints

### Job Management

- `POST /tasks` - Create a new job
- `GET /tasks` - List jobs (with filters)
- `GET /tasks/:id` - Get job details + execution history
- `POST /tasks/:id/run-now` - Trigger immediate execution

### System Monitoring

- `GET /health` - Health check
- `GET /system/status` - System-wide status (leader, workers, queue, stats)

### Admin Operations

- `POST /admin/scheduler/enable` - Enable dispatcher
- `POST /admin/scheduler/disable` - Disable dispatcher
- `GET /admin/dlq` - View DLQ tasks
- `POST /admin/dlq/:id/retry` - Retry from DLQ
- `POST /admin/faults/*` - Fault injection (testing)

## Controllers

### `jobs.controller.js`
Handles job CRUD operations:
- Create job with idempotency
- List jobs with filtering
- Get job details with execution history
- Trigger immediate execution

### `system.controller.js`
Provides system observability:
- Scheduler status (leader, uptime, dispatch lag)
- Worker count
- Redis queue depth
- Job statistics (success/failure rates)

### `admin.controller.js`
Admin operations:
- Scheduler control (enable/disable)
- DLQ management
- Fault injection for testing

## Routes

Each route file maps HTTP endpoints to controller methods:
- `jobs.routes.js` - Job endpoints
- `system.routes.js` - System endpoints
- `admin.routes.js` - Admin endpoints
- `health.routes.js` - Health check

## Middleware

### `validate-job.js`
Validates job payloads based on type:
- **HTTP:** Requires `method`, `url`
- **SHELL:** Requires `command`
- **DELAY:** Requires `duration_ms`

### `error-handler.js`
Centralized error handling:
- Catches all errors
- Formats error responses
- Logs errors

### `request-logger.js`
Logs all incoming requests with:
- Request ID
- Method, path
- IP address
- Response time

## Starting the API

```bash
# Development (with auto-reload)
npm run dev:api

# Production
node api/server.js
```

**Port:** 3000 (configurable via `API_PORT` env var)

## Example Requests

### Create HTTP Job
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "HTTP",
    "payload": {
      "method": "POST",
      "url": "https://api.example.com/webhook",
      "headers": {"Authorization": "Bearer token"},
      "body": {"event": "test"}
    },
    "scheduledAt": "2024-01-01T12:00:00Z"
  }'
```

### Get System Status
```bash
curl http://localhost:3000/system/status
```

### View DLQ Tasks
```bash
curl http://localhost:3000/admin/dlq
```

## Design Principles

1. **Stateless** - API servers can scale horizontally
2. **No Dispatch Logic** - API only persists, Scheduler dispatches
3. **Idempotency** - Duplicate requests return existing job
4. **Validation** - All payloads validated before persistence
5. **Observability** - Comprehensive logging and metrics
