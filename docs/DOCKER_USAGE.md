# 🐳 Docker Usage Guide

This guide covers common operations for managing the Distributed Task Scheduler using Docker Compose.

## 📋 Quick Reference

| Action | Command |
|--------|---------|
| **🚀 Start / Build** | `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --scale scheduler=3 --scale worker=5` |
| **🔄 Restart** | `docker compose -f docker-compose.prod.yml --env-file .env.prod restart` |
| **🛑 Stop** | `docker compose -f docker-compose.prod.yml --env-file .env.prod down` |
| **🧹 Hard Reset (Wipe Data)** | `docker compose -f docker-compose.prod.yml --env-file .env.prod down -v` |
| **📜 View Logs** | `docker compose -f docker-compose.prod.yml logs -f` |

---

## 🛠️ Detailed Commands

### 1. Fresh Start (Build & Run)
Use this when you have:
- Just cloned the repo
- Pulled new code changes
- Changed `Dockerfile` or dependencies

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --scale scheduler=3 --scale worker=5
```
**Flags explained:**
- `--build`: Recompiles the code/images.
- `--scale scheduler=3`: Starts 3 scheduler instances.
- `--scale worker=5`: Starts 5 worker instances.
- `-d`: Detached mode (runs in background).

### 2. Restart Services
Use this when you have:
- Changed `.env.prod` configuration (e.g., rate limits, timeouts)
- Want to reboot the application without rebuilding

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart
```

### 3. Stop Everything
Stops and removes containers. **Data in databases persists**.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

### 4. Hard Reset (Wipe Everything)
⚠️ **WARNING: This deletes all database data!**
Use this when:
- You changed the `DB_PASSWORD` in `.env.prod` (fix password mismatch)
- You want a completely fresh state for a demo

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down -v
```
**Flags explained:**
- `-v`: Removes named volumes (`pg_data`, `redis_data`), ensuring databases are re-initialized from scratch.

### 5. View Logs
Watch the output of all services in real-time.

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f scheduler
```

---

## 🔧 Troubleshooting

### "Password authentication failed for user scheduler"
**Cause:** You changed `DB_PASSWORD` in `.env.prod`, but the Postgres volume already exists with the old password.
**Fix:** Perform a **Hard Reset** (see command #4 above) to wipe the volume and recreate the DB with the new password.

### "Reset Instances" button not working
**Cause:** The backend cannot identify which containers to restart.
**Fix:** Ensure your `.env.prod` contains the project name:
```properties
COMPOSE_PROJECT_NAME=distributed-task-scheduler
```
Then restart the application.

### "Bind for 0.0.0.0:3000 failed: port is already allocated"
**Cause:** Another process (or a zombie container) is using port 3000.
**Fix:**
```bash
# Find and kill the process
lsof -i :3000
kill -9 <PID>
```
