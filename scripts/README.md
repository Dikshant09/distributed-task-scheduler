# Scripts

Utility scripts for project management and testing.

## Files

### `create-test-jobs.sh`

**Purpose:** Create sample jobs for testing

**Usage:**
```bash
./scripts/create-test-jobs.sh
```

**What it does:**
- Creates HTTP, Shell, and Delay jobs
- Tests different payload formats
- Useful for manual testing and demos

### `cleanup-db.sh`

**Purpose:** Clean up database (remove all jobs and workers)

**Usage:**
```bash
./scripts/cleanup-db.sh
```

**Warning:** Deletes all data! Use with caution.

**What it does:**
- Truncates `tasks` table
- Truncates `workers` table
- Resets database to clean state

### `monitor.sh`

**Purpose:** Monitor system in real-time

**Usage:**
```bash
./scripts/monitor.sh
```

**What it does:**
- Tails all log files simultaneously
- Shows API, Scheduler, Worker, and Client logs
- Useful for debugging and observability

**Example Output:**
```
==> logs/api.log <==
{"level":"info","message":"Task created","taskId":"abc-123"}

==> logs/scheduler.log <==
{"level":"info","message":"Dispatched 5 tasks"}

==> logs/worker.log <==
{"level":"info","message":"Task abc-123 SUCCEEDED"}
```

## Creating New Scripts

When adding new scripts:

1. Create file in `scripts/` directory
2. Make executable: `chmod +x scripts/your-script.sh`
3. Add shebang: `#!/bin/bash`
4. Document in this README
5. Use consistent error handling

## Script Template

```bash
#!/bin/bash

set -e  # Exit on error

echo "🚀 Script Name"
echo "=============="

# Your script logic here

echo "✅ Done!"
```

## Best Practices

- Use `set -e` to exit on errors
- Add descriptive echo statements
- Check prerequisites (e.g., services running)
- Handle errors gracefully
- Document usage in this README
