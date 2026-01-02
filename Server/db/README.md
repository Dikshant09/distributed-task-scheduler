# Database Architecture

## Overview
This project uses a **SQL-first, repository pattern** approach instead of an ORM.

## Directory Structure

```
Server/db/
├── index.js              # PostgreSQL connection pool
├── migrations/           # SQL migration files
│   └── 001_init.sql     # Initial schema (tasks + workers tables)
├── models/              # Empty (no ORM models needed)
└── repositories/        # Data access layer
    ├── tasks.repo.js    # Task CRUD operations
    └── workers.repo.js  # Worker heartbeat operations
```

## Why No ORM?

This project intentionally avoids ORMs (Sequelize, TypeORM, etc.) for several reasons:

1. **Performance** - Direct SQL queries are faster and more predictable
2. **Control** - Full control over query optimization and indexing
3. **Simplicity** - No ORM configuration or model definitions needed
4. **Distributed Systems** - Easier to implement distributed patterns like:
   - Optimistic locking with `assigned_worker_id`
   - Lease-based execution with `lease_expiry`
   - Leader election epochs

## Database Schema

### Tasks Table
- Stores all scheduled jobs
- Supports lease-based execution
- Tracks retries and failures
- Idempotency via `idempotency_key`

### Workers Table
- Tracks worker heartbeats
- Enables failure detection
- Supports horizontal scaling

## Setup Process

The `setup.sh` script automatically:
1. Creates PostgreSQL database `task_scheduler`
2. Runs migrations from `Server/db/migrations/001_init.sql`
3. Creates both `tasks` and `workers` tables with proper indexes

## Adding New Tables

To add new tables:
1. Create a new migration file: `Server/db/migrations/002_feature_name.sql`
2. Add the migration to `setup.sh`
3. Create corresponding repository in `Server/db/repositories/`

## Repository Pattern

Instead of models, we use repositories that:
- Encapsulate SQL queries
- Return plain JavaScript objects
- Handle database errors
- Provide clear interfaces

Example:
```javascript
// tasks.repo.js
const getTaskById = async (id) => {
    const res = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return res.rows[0];
};
```

This approach is **cleaner, faster, and more maintainable** for distributed systems.
