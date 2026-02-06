# AWS EC2 Deployment Guide with HTTPS

Complete guide to deploy the Distributed Task Scheduler on AWS EC2 with free SSL certificates using Let's Encrypt and DuckDNS.

---

## 📋 Prerequisites

- AWS Account (Free Tier eligible)
- DuckDNS account (free at https://www.duckdns.org)
- SSH client installed on your local machine
- Git installed

---

## 💰 Cost Breakdown

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| **EC2 t2.micro** | $0 | Free tier: 750 hrs/month for 12 months |
| **EBS Storage (30 GB)** | $0 | Free tier: 30 GB/month for 12 months |
| **Data Transfer** | $0 | Free tier: 15 GB/month outbound |
| **Public IP** | $0 | Free while instance is running |
| **SSL Certificate** | $0 | Let's Encrypt (free) |
| **Domain** | $0 | DuckDNS (free) |
| **Total (First 12 months)** | **$0** | ✅ Completely free! |
| **After 12 months** | ~$8-10/month | t2.micro + storage |

---

## 🚀 Step 1: Launch EC2 Instance

### 1.1 Create EC2 Instance

1. **Login to AWS Console**: https://console.aws.amazon.com
2. **Navigate to EC2**: Services → EC2 → Launch Instance
3. **Configure Instance**:

| Setting | Value | Notes |
|---------|-------|-------|
| **Name** | `distributed-task-scheduler` | Any descriptive name |
| **AMI** | Ubuntu Server 24.04 LTS (64-bit x86) | Free tier eligible |
| **Instance Type** | `t2.micro` or `t3.micro` | 1 vCPU, 1 GB RAM (free tier) |
| **Key Pair** | Create new: `aws-task-scheduler-key` | Download and save the `.pem` file |
| **Storage** | **30 GiB gp3** | ⚠️ Change from default 8 GB |

### 1.2 Configure Security Group

Create a new security group with these **inbound rules**:

| Type | Protocol | Port Range | Source | Description |
|------|----------|------------|--------|-------------|
| SSH | TCP | 22 | 0.0.0.0/0 | SSH access |
| HTTP | TCP | 80 | 0.0.0.0/0 | Web traffic |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Secure web traffic |

> **Security Note**: For better security, restrict SSH (port 22) to your IP address instead of 0.0.0.0/0

### 1.3 Launch Instance

1. Click **Launch Instance**
2. Wait for instance state to be **Running**
3. Note your **Public IPv4 address** (e.g., `54.123.45.67`)

---

## 🔐 Step 2: Connect to Your Instance

### 2.1 Set Key Permissions

```bash
# On your local machine (Mac/Linux)
chmod 400 ~/Downloads/aws-task-scheduler-key.pem
```

### 2.2 SSH into Instance

```bash
# Replace with your actual public IP
ssh -i ~/Downloads/aws-task-scheduler-key.pem ubuntu@54.123.45.67
```

You should see the Ubuntu welcome message!

---

## 🐳 Step 3: Install Docker and Dependencies

### 3.1 Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### 3.2 Install Docker

```bash
# Install Docker using the official script
curl -fsSL https://get.docker.com | sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Apply group changes
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 3.3 Install Certbot (for SSL)

```bash
# Install Certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Verify installation
certbot --version
```

---

## 📦 Step 4: Deploy Application

### 4.1 Clone Repository

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/distributed-task-scheduler.git
cd distributed-task-scheduler
```

> **Note**: If your repository is private, you'll need to use a personal access token or make it temporarily public.

### 4.2 Run Deployment Script

The project includes a `deploy.sh` script that automates the deployment:

```bash
# Make the script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

**What the script does:**
- Creates `.env.prod` with a secure random password
- Builds all Docker images
- Starts services with 3 schedulers and 5 workers
- Runs health checks
- Shows service status

### 4.3 Verify Deployment

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Check API health
curl http://localhost:3000/health

# View logs
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

### 4.4 Access Application

Visit `http://YOUR_EC2_PUBLIC_IP` in your browser. You should see the application!

---

## 🌐 Step 5: Configure DuckDNS Domain

### 5.1 Create DuckDNS Account

1. Go to https://www.duckdns.org
2. Sign in with GitHub, Google, or another provider
3. You'll get a **token** (save this!)

### 5.2 Create Subdomain

1. In the DuckDNS dashboard, enter: `distributed-task-scheduler`
2. Click **Add Domain**
3. Update the IP to your **EC2 Public IP** (e.g., `54.123.45.67`)
4. Click **Update IP**

Your domain is now: `distributed-task-scheduler.duckdns.org`

### 5.3 Set Up Auto-Update Script

```bash
# Create update script (replace YOUR_TOKEN with your actual DuckDNS token)
echo "curl 'https://www.duckdns.org/update?domains=distributed-task-scheduler&token=YOUR_TOKEN&ip='" | sudo tee /usr/local/bin/duckdns-update.sh

# Make executable
sudo chmod +x /usr/local/bin/duckdns-update.sh

# Test it
/usr/local/bin/duckdns-update.sh
# Should return: OK

# Add to crontab (updates every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/duckdns-update.sh >/dev/null 2>&1") | crontab -

# Verify cron job
crontab -l
```

### 5.4 Verify DNS

```bash
# Check DNS resolution
nslookup distributed-task-scheduler.duckdns.org 8.8.8.8
```

Should return your EC2 IP address!

---

## 🔒 Step 6: Set Up HTTPS with Let's Encrypt

### 6.1 Stop Nginx (Certbot Needs Port 80)

```bash
docker compose -f docker-compose.prod.yml stop nginx
```

### 6.2 Obtain SSL Certificate

```bash
# Get SSL certificate
sudo certbot certonly --standalone -d distributed-task-scheduler.duckdns.org
```

You'll be prompted for:
- Email address (for renewal notifications)
- Agree to Terms of Service
- Share email with EFF (optional)

**Success!** Certificate saved at:
- `/etc/letsencrypt/live/distributed-task-scheduler.duckdns.org/fullchain.pem`
- `/etc/letsencrypt/live/distributed-task-scheduler.duckdns.org/privkey.pem`

### 6.3 Update Nginx Configuration for SSL (Optional)

> **Note**: Skip this step if you're using `distributed-task-scheduler.duckdns.org` - the configuration is already correct!

**Only needed if using a different domain name.** The project already includes `Client/nginx-ssl.conf` configured for `distributed-task-scheduler.duckdns.org`. If you used a different domain, update it:

```bash
# Edit nginx-ssl.conf to use your custom domain
sed -i 's/distributed-task-scheduler.duckdns.org/YOUR_CUSTOM_DOMAIN.duckdns.org/g' ~/distributed-task-scheduler/Client/nginx-ssl.conf
```

Or manually edit `Client/nginx-ssl.conf` and replace the domain name on lines 3, 11, 14, and 15.

### 6.4 Update Docker Compose to Use SSL Config

The `docker-compose.prod.yml` already mounts the SSL certificates and uses `nginx-ssl.conf`. Verify the nginx service configuration:

```yaml
nginx:
  volumes:
    - /etc/letsencrypt:/etc/letsencrypt:ro
    - ./Client/nginx-ssl.conf:/etc/nginx/conf.d/default.conf:ro
  ports:
    - "80:80"
    - "443:443"
```

### 6.5 Restart Nginx with SSL

```bash
# Restart nginx with new SSL configuration
docker compose -f docker-compose.prod.yml up -d nginx

# Verify nginx is running
docker compose -f docker-compose.prod.yml ps nginx
```

### 6.6 Test HTTPS

Visit: **https://distributed-task-scheduler.duckdns.org**

You should see:
- ✅ Secure padlock icon in browser
- ✅ Valid SSL certificate
- ✅ Application loads correctly
- ✅ HTTP automatically redirects to HTTPS

---

## 🔄 Step 7: Configure SSL Auto-Renewal

Let's Encrypt certificates expire every **90 days**. Set up automatic renewal:

### 7.1 Create Renewal Hooks

```bash
# Pre-hook: Stop nginx before renewal
echo '#!/bin/bash
cd /home/ubuntu/distributed-task-scheduler
docker compose -f docker-compose.prod.yml stop nginx' | sudo tee /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh

# Post-hook: Start nginx after renewal
echo '#!/bin/bash
cd /home/ubuntu/distributed-task-scheduler
docker compose -f docker-compose.prod.yml start nginx' | sudo tee /etc/letsencrypt/renewal-hooks/post/start-nginx.sh

# Make executable
sudo chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/post/start-nginx.sh
```

### 7.2 Test Auto-Renewal

```bash
# Dry run (doesn't actually renew, just tests)
sudo certbot renew --dry-run
```

Expected output:
```
Congratulations, all simulated renewals succeeded
```

### 7.3 Verify Renewal Timer

```bash
# Check Certbot's automatic renewal timer
sudo systemctl status snap.certbot.renew.timer
```

Certbot automatically checks for renewal **twice daily**. Certificates renew automatically **30 days before expiration**.

---

## 🛠️ Step 8: Post-Deployment Tasks

### 8.1 Fix Process Registry View (If Needed)

If schedulers/workers don't show in the UI:

```bash
# Create process registry view
docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "DROP VIEW IF EXISTS process_registry; CREATE VIEW process_registry AS SELECT id as process_id, type as process_type, pid, is_leader, status, current_task_id, started_at, last_updated FROM process_instances;"

# Restart schedulers and workers to register
docker compose -f docker-compose.prod.yml restart scheduler worker

# Wait a few seconds
sleep 5
```

Then refresh your browser!

### 8.2 Verify All Services

```bash
# Check all containers
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

### 8.3 Monitor Resources

```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check Docker resource usage
docker stats --no-stream
```

---

## 📊 Monitoring and Maintenance

### Check Application Health

```bash
# View all container status
docker compose -f docker-compose.prod.yml ps

# View logs for specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f scheduler
docker compose -f docker-compose.prod.yml logs -f worker

# Check resource usage
docker stats
```

### Restart Services

```bash
# Restart all services
docker compose -f docker-compose.prod.yml restart

# Restart specific service
docker compose -f docker-compose.prod.yml restart api

# Full rebuild and restart
docker compose -f docker-compose.prod.yml down
./deploy.sh
```

### Clean Up Docker Resources

```bash
# Remove unused images and containers
docker system prune -a --volumes -f

# Remove old logs
sudo journalctl --vacuum-time=7d
```

---

## 🔧 Troubleshooting

### Issue: Cannot Connect to EC2 Instance

**Solution**: Check security group allows SSH (port 22) from your IP

```bash
# Verify security group in AWS Console
# EC2 → Security Groups → Check inbound rules
```

### Issue: Website Not Loading (HTTP)

**Solution**: Check security group allows HTTP (port 80)

```bash
# Check nginx is running
docker compose -f docker-compose.prod.yml ps nginx

# Check nginx logs
docker compose -f docker-compose.prod.yml logs nginx
```

### Issue: SSL Certificate Failed

**Possible causes**:
1. **DNS not propagated**: Wait 5-10 minutes after setting up DuckDNS
2. **Port 80 blocked**: Ensure security group allows HTTP (port 80)
3. **Nginx running**: Stop nginx before running Certbot

```bash
# Verify DNS
nslookup distributed-task-scheduler.duckdns.org 8.8.8.8

# Stop nginx
docker compose -f docker-compose.prod.yml stop nginx

# Retry certificate
sudo certbot certonly --standalone -d distributed-task-scheduler.duckdns.org
```

### Issue: Workers/Schedulers Not Showing in UI

**Solution**: Create process registry view and restart

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "DROP VIEW IF EXISTS process_registry; CREATE VIEW process_registry AS SELECT id as process_id, type as process_type, pid, is_leader, status, current_task_id, started_at, last_updated FROM process_instances;"

docker compose -f docker-compose.prod.yml restart scheduler worker
```

### Issue: Out of Disk Space

**Solution**: Clean up Docker resources

```bash
# Check disk usage
df -h

# Clean Docker
docker system prune -a --volumes -f

# Remove old logs
sudo journalctl --vacuum-time=3d
```

### Issue: High Memory Usage

**Solution**: Reduce number of schedulers and workers

```bash
# Stop services
docker compose -f docker-compose.prod.yml down

# Start with reduced scale (better for t2.micro)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=2 --scale worker=3
```

---

## 🎯 Quick Reference Commands

### Application Management

```bash
# Start application (using deploy script)
./deploy.sh

# Start manually with custom scale
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=2 --scale worker=3

# Stop application
docker compose -f docker-compose.prod.yml down

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart specific service
docker compose -f docker-compose.prod.yml restart api
```

### SSL Management

```bash
# Test renewal
sudo certbot renew --dry-run

# Force renewal (if within 30 days of expiry)
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates
```

### DuckDNS Update

```bash
# Manual update (replace YOUR_TOKEN)
curl "https://www.duckdns.org/update?domains=distributed-task-scheduler&token=YOUR_TOKEN&ip="
```

### Database Access

```bash
# Access PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler

# Check process instances
docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "SELECT id, type, is_leader FROM process_instances;"
```

---

## 📦 Architecture Overview

**Services Running:**

| Service | Description | Memory Limit | CPU Limit |
|---------|-------------|--------------|-----------|
| **nginx** | Frontend (React) + reverse proxy | 64 MB | 0.1 |
| **api** | REST API + WebSocket server | 256 MB | 0.5 |
| **postgres** | Database (tasks, executions, instances) | 256 MB | 0.25 |
| **redis** | Task queue (Redis Streams) | 128 MB | 0.1 |
| **etcd** | Leader election | 64 MB | 0.1 |
| **scheduler** | Task scheduling (3 instances) | 128 MB each | 0.2 each |
| **worker** | Task execution (5 instances) | 128 MB each | 0.2 each |
| **dispatcher** | Task distribution | 64 MB | 0.1 |
| **recovery** | Failed task recovery | 64 MB | 0.1 |
| **cleanup** | Session cleanup | 64 MB | 0.05 |

**Total Memory Usage**: ~1.5-2 GB (with 3 schedulers + 5 workers)

**Recommended for t2.micro (1 GB RAM)**: 2 schedulers + 3 workers (~800 MB)

---

## 💡 Optimization Tips

### For t2.micro (1 GB RAM)

```bash
# Use reduced scale
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=2 --scale worker=3
```

### Add Swap Space

```bash
# Add 1 GB swap for safety
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap
free -h
```

---

## ✅ Deployment Checklist

- [ ] EC2 instance launched (t2.micro, 30 GB storage)
- [ ] Security group configured (ports 22, 80, 443)
- [ ] SSH access working
- [ ] Docker and Docker Compose installed
- [ ] Certbot installed
- [ ] Application cloned and deployed
- [ ] Application running on HTTP
- [ ] DuckDNS domain configured
- [ ] SSL certificate obtained
- [ ] HTTPS working
- [ ] Auto-renewal configured and tested
- [ ] All services healthy
- [ ] Process registry view created

---

## 🎉 Success!

Your application is now live at:
- **HTTPS**: https://distributed-task-scheduler.duckdns.org
- **HTTP**: http://distributed-task-scheduler.duckdns.org (redirects to HTTPS)

**Features**:
- ✅ Free SSL certificate (auto-renews)
- ✅ Custom domain (DuckDNS)
- ✅ Fully containerized
- ✅ Multiple schedulers and workers
- ✅ Leader election
- ✅ Real-time updates
- ✅ Chaos engineering features

**Cost**: $0/month for first 12 months (AWS Free Tier)

---

## 📚 Additional Resources

- [AWS Free Tier](https://aws.amazon.com/free/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [DuckDNS Documentation](https://www.duckdns.org/spec.jsp)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Certbot Documentation](https://certbot.eff.org/docs/)

---

**Need help?** Check the troubleshooting section or review the logs!


Trouble Shooting

```
# On your EC2 instance, run this command:
docker-compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "DROP VIEW IF EXISTS process_registry; CREATE VIEW process_registry AS SELECT id as process_id, type as process_type, pid, is_leader, status, current_task_id, started_at, last_updated FROM process_instances;"

# Then restart schedulers and workers to re-register
docker-compose -f docker-compose.prod.yml restart scheduler worker

# Wait a few seconds for them to register
sleep 5
```


```
# Stop all containers
docker-compose -f docker-compose.prod.yml down

# Remove the problematic postgres container and its volumes
docker-compose -f docker-compose.prod.yml rm -f postgres

# Clean up any orphaned containers
docker system prune -f

# Now restart everything fresh
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=3 --scale worker=5

# Check status
docker-compose -f docker-compose.prod.yml ps
```