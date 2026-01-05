# AWS EC2 Deployment Guide

Complete guide for deploying the Distributed Task Scheduler on AWS EC2 Free Tier.

## Table of Contents
- [Prerequisites](#prerequisites)
- [EC2 Instance Setup](#ec2-instance-setup)
- [Deployment Process](#deployment-process)
- [Common Issues & Solutions](#common-issues--solutions)
- [Post-Deployment](#post-deployment)

---

## Prerequisites

### Local Requirements
- Git repository with `azure-deploy` branch
- SSH key pair for EC2 access

### AWS Account
- Active AWS account with free tier access
- Free tier includes:
  - 750 hours/month of t2.micro (1 vCPU, 1 GB RAM)
  - 30 GB EBS storage
  - 100 GB bandwidth

---

## EC2 Instance Setup

### 1. Launch EC2 Instance

**Instance Configuration:**
- **AMI**: Ubuntu Server 24.04 LTS (HVM), SSD Volume Type
- **Instance Type**: t2.micro (1 vCPU, 1 GB RAM)
- **Storage**: 8 GB gp3 (free tier: up to 30 GB)

**Network Settings:**
- **Security Group Rules**:
  - SSH (port 22): 0.0.0.0/0 (or restrict to your IP)
  - HTTP (port 80): 0.0.0.0/0 (required for public access)

**Key Pair:**
- Create new key pair or use existing
- Download `.pem` file and save securely
- Set permissions: `chmod 400 your-key.pem`

### 2. Connect to Instance

**Option 1: SSH (if key pair works)**
```bash
ssh -i /path/to/your-key.pem ubuntu@<public-ip>
```

**Option 2: EC2 Instance Connect (browser-based)**
1. Go to EC2 Console → Instances
2. Select your instance
3. Click "Connect" → "EC2 Instance Connect" tab
4. Click "Connect" (opens browser terminal)

---

## Deployment Process

### 1. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add user to docker group
sudo usermod -aG docker ubuntu && newgrp docker

# Verify installation
docker --version
```

### 2. Clone Repository

```bash
# Make repo temporarily public or use personal access token
git clone -b azure-deploy https://github.com/YOUR_USERNAME/distributed-task-scheduler.git
cd distributed-task-scheduler
```

### 3. Configure Environment

The `deploy.sh` script automatically creates `.env.prod` with a secure password:

```bash
# Review the deployment script
cat deploy.sh

# Make it executable (if needed)
chmod +x deploy.sh
```

### 4. Deploy Application

```bash
# Run deployment script
./deploy.sh

# This will:
# - Generate .env.prod with secure password
# - Build Docker images
# - Start all services
# - Run health check
```

### 5. Scale for t2.micro (1 GB RAM)

The default configuration (3 schedulers, 5 workers) uses ~400-500 MB. For t2.micro:

```bash
# Stop services
docker compose -f docker-compose.prod.yml down

# Start with reduced scale
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=1 --scale worker=2
```

**Recommended Scale for t2.micro:**
- 1 Scheduler
- 2 Workers
- Total memory usage: ~300-400 MB (safe for 1 GB RAM)

---

## Common Issues & Solutions

### Issue 1: Database Password Authentication Failed

**Symptom:**
```
password authentication failed for user "scheduler"
```

**Cause:** Password mismatch between `.env.prod` and running containers.

**Solution:**
```bash
# Stop all containers
docker compose -f docker-compose.prod.yml down

# Verify password in .env.prod
cat .env.prod

# Restart with correct password
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=1 --scale worker=2
```

### Issue 2: Frontend Shows "Failed to load system status"

**Symptom:** API requests fail, browser shows errors.

**Cause:** Frontend JavaScript hardcoded to `localhost:3000`.

**Solution:** Already fixed in code with environment variable configuration:
- `Client/src/api/api.js` uses `VITE_API_URL`
- `docker-compose.prod.yml` passes `/api` as build arg
- Nginx proxies `/api/*` to backend

If still seeing issues, rebuild nginx:
```bash
docker compose -f docker-compose.prod.yml down
docker rmi distributed-task-scheduler-nginx
docker compose -f docker-compose.prod.yml build --no-cache nginx
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=1 --scale worker=2
```

### Issue 3: WebSocket Connection Failed

**Symptom:**
```
WebSocket connection to 'ws://IP/socket.io/' failed
```

**Cause:** Socket.IO client trying to connect to wrong path.

**Solution:** Already fixed in code:
- `SystemTopology.jsx` and `Admin.jsx` use `window.location.origin` with `path: '/socket.io/'`
- Nginx proxies `/socket.io/*` to backend

Verify nginx configuration:
```bash
# Check nginx config includes WebSocket proxy
docker compose -f docker-compose.prod.yml exec nginx cat /etc/nginx/conf.d/default.conf | grep -A 10 "socket.io"
```

### Issue 4: Schedulers/Workers Not Showing in UI

**Symptom:** `/instances` endpoint returns empty arrays, but containers are running.

**Cause:** Database table naming mismatch (`process_registry` vs `process_instances`).

**Solution:**
```bash
# Create view to map old name to new table
docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "DROP VIEW IF EXISTS process_registry; CREATE VIEW process_registry AS SELECT id as process_id, type as process_type, pid, is_leader, status, current_task_id, started_at, last_updated FROM process_instances;"

# Restart schedulers and workers to re-register
docker compose -f docker-compose.prod.yml restart scheduler worker

# Wait 5 seconds, then refresh browser
```

### Issue 5: Only Some Instances Showing

**Symptom:** Have 3 schedulers and 5 workers running, but UI shows only 2 of each.

**Cause:** Instances started after view creation aren't included.

**Solution:**
```bash
# Restart all schedulers and workers
docker compose -f docker-compose.prod.yml restart scheduler worker

# Wait a few seconds for re-registration
sleep 5

# Refresh browser
```

### Issue 6: Browser Cache Issues

**Symptom:** Changes not reflecting after rebuild.

**Solution:**
```bash
# Hard refresh browser
# Mac: Cmd + Shift + R
# Windows/Linux: Ctrl + Shift + R

# Or use Incognito/Private mode
# Or clear site data in DevTools → Application → Storage
```

---

## Post-Deployment

### Access Your Application

Your app is now live at: `http://<EC2-PUBLIC-IP>`

**Key Features:**
- **Dashboard**: System health and topology visualization
- **Jobs**: Create and manage scheduled tasks
- **Schedule**: View task schedules
- **Admin**: Chaos engineering controls and system reset

### Monitoring

```bash
# View all running containers
docker compose -f docker-compose.prod.yml ps

# Check resource usage
docker stats

# View logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs api --tail=50
docker compose -f docker-compose.prod.yml logs scheduler --tail=50
docker compose -f docker-compose.prod.yml logs worker --tail=50
```

### Useful Commands

```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Stop and remove volumes (fresh start)
docker compose -f docker-compose.prod.yml down -v

# Restart specific service
docker compose -f docker-compose.prod.yml restart api

# Rebuild specific service
docker compose -f docker-compose.prod.yml up -d --build nginx

# View database
docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler

# Check process_instances table
docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "SELECT id, type, is_leader FROM process_instances;"
```

### Adding a Custom Domain (Optional)

**Option 1: Free Subdomain (DuckDNS)**
1. Go to https://www.duckdns.org
2. Sign in with GitHub/Google
3. Create subdomain: `your-app.duckdns.org`
4. Point to your EC2 public IP
5. Access via: `http://your-app.duckdns.org`

**Option 2: AWS Route 53 + Your Domain**
1. Purchase domain or use existing
2. Create hosted zone in Route 53
3. Add A record pointing to EC2 IP
4. Update domain nameservers

### Cost Optimization

**Current Setup (t2.micro):**
- **Free Tier**: 750 hours/month (always free for first 12 months)
- **After Free Tier**: ~$8-10/month

**Memory Usage:**
- 1 Scheduler + 2 Workers: ~300-400 MB
- Leaves ~600 MB for OS and bursts

**Optional: Add Swap for Safety**
```bash
# Add 1 GB swap space
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Troubleshooting Checklist

If something isn't working:

1. **Check all containers are running:**
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

2. **Check logs for errors:**
   ```bash
   docker compose -f docker-compose.prod.yml logs --tail=100
   ```

3. **Verify database connection:**
   ```bash
   docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "\dt"
   ```

4. **Test API directly:**
   ```bash
   curl http://localhost:3000/system/status
   ```

5. **Check nginx is proxying:**
   ```bash
   docker compose -f docker-compose.prod.yml logs nginx --tail=20
   ```

6. **Verify process_registry view exists:**
   ```bash
   docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "\dv"
   ```

7. **Hard refresh browser** to clear cache

---

## Architecture Overview

**Services Running:**
- **nginx**: Frontend (React SPA) + reverse proxy
- **api**: REST API + WebSocket server
- **postgres**: Database (tasks, executions, instances)
- **redis**: Task queue (Redis Streams)
- **etcd**: Leader election
- **scheduler**: Task scheduling (1-3 instances)
- **worker**: Task execution (2-5 instances)
- **dispatcher**: Task distribution
- **recovery**: Failed task recovery
- **cleanup**: Session cleanup

**Resource Allocation (t2.micro):**
| Service | Memory Limit | CPU Limit |
|---------|-------------|-----------|
| nginx | 64 MB | 0.1 |
| api | 256 MB | 0.5 |
| postgres | 256 MB | 0.5 |
| redis | 128 MB | 0.2 |
| etcd | 64 MB | 0.1 |
| scheduler | 128 MB | 0.3 |
| worker | 128 MB | 0.3 |
| dispatcher | 64 MB | 0.2 |
| recovery | 64 MB | 0.1 |
| cleanup | 64 MB | 0.1 |

---

## Security Notes

**Production Recommendations:**
1. ✅ Secure password generated automatically
2. ⚠️ Restrict SSH to your IP only
3. ⚠️ Add HTTPS (Let's Encrypt) for production
4. ⚠️ Use AWS Secrets Manager for sensitive data
5. ⚠️ Enable CloudWatch monitoring
6. ⚠️ Set up automated backups

**Current Setup (Demo):**
- HTTP only (no SSL)
- Public SSH access (protected by key)
- Suitable for demos and testing

---

## Next Steps

1. **Test the application** thoroughly
2. **Create some scheduled tasks** to verify functionality
3. **Try chaos engineering features** (Kill Leader, Kill Worker, etc.)
4. **Monitor resource usage** with `docker stats`
5. **Set up domain** (optional)
6. **Add to portfolio** with screenshots and demo link

---

## Support

For issues or questions:
- Check logs: `docker compose -f docker-compose.prod.yml logs`
- Review this guide's troubleshooting section
- Check GitHub repository issues

**Congratulations! Your distributed task scheduler is now live on AWS! 🚀**
