# Scripts

Utility scripts for testing, monitoring, and managing the distributed task scheduler.

## Available Scripts

### `create-test-jobs.sh`

**Purpose:** Create sample jobs for testing and demos

**Usage:**
```bash
./scripts/create-test-jobs.sh
```

**What it does:**
- Creates HTTP webhook jobs
- Creates shell command jobs
- Creates delay/test jobs
- Tests different payload formats
- Useful for manual testing and demonstrations

### `cleanup-db.sh`

**Purpose:** Clean up database (remove all jobs and workers)

**Usage:**
```bash
./scripts/cleanup-db.sh
```

**⚠️ Warning:** Deletes all data! Use with caution in development only.

**What it does:**
- Truncates `tasks` table
- Truncates `workers` table  
- Clears process instances
- Resets database to clean state

### `monitor.sh`

**Purpose:** Monitor system logs in real-time

**Usage:**
```bash
./scripts/monitor.sh
```

**What it does:**
- Tails all log files simultaneously
- Shows API, Scheduler, Worker, and Client logs
- Useful for debugging and observability
- Color-coded output for easy reading

**Example Output:**
```
==> logs/api.log <==
{"level":"info","message":"Task created","taskId":"abc-123"}

==> logs/scheduler1.log <==
{"level":"info","message":"Dispatched 5 tasks"}

==> logs/worker1.log <==
{"level":"info","message":"Task abc-123 SUCCEEDED"}
```

## Project Management Scripts

### Root Directory Scripts

#### `run.sh`
**Development mode** with auto-restart on file changes
```bash
./run.sh
```
- Starts infrastructure (Redis, Etcd, PostgreSQL)
- Starts API server
- Starts configured number of schedulers (default: 3)
- Starts configured number of workers (default: 5, max: 5)
- Starts frontend dev server
- Auto-restarts on crashes

#### `run_prod.sh`
**Production mode** without auto-restart
```bash
./run_prod.sh
```
- Same as `run.sh` but without auto-restart
- Demonstrates true fault tolerance
- Workers stay dead when killed
- Better for testing resilience

#### `stop.sh`
Stop all services
```bash
./stop.sh
```
- Kills all Node.js processes (API, schedulers, workers)
- Stops frontend dev server
- Cleans up background processes

## Configuration

Scripts read from `.env` file for instance counts:
```bash
NUM_SCHEDULERS=3  # Number of scheduler instances
NUM_WORKERS=5     # Number of worker instances (max: 5)
```

## Creating New Scripts

When adding new scripts:

1. **Create file** in `scripts/` directory
2. **Make executable:** `chmod +x scripts/your-script.sh`
3. **Add shebang:** `#!/bin/bash`
4. **Document** in this README
5. **Use consistent error handling**

## Script Template

```bash
#!/bin/bash

set -e  # Exit on error

echo "🚀 Script Name"
echo "=============="

# Check prerequisites
if ! command -v some-tool &> /dev/null; then
    echo "❌ Error: some-tool not found"
    exit 1
fi

# Your script logic here

echo "✅ Done!"
```

## Best Practices

- ✅ Use `set -e` to exit on errors
- ✅ Add descriptive echo statements with emojis
- ✅ Check prerequisites (e.g., services running)
- ✅ Handle errors gracefully with meaningful messages
- ✅ Document usage and examples in this README
- ✅ Use consistent formatting and style
- ✅ Test scripts in both dev and prod modes

## Debugging Scripts

### View script execution
```bash
bash -x ./scripts/your-script.sh
```

### Check script syntax
```bash
bash -n ./scripts/your-script.sh
```

### Make script executable
```bash
chmod +x ./scripts/your-script.sh
```
