# Azure VM Deployment Guide

Complete guide for deploying the Distributed Task Scheduler on Azure Free Tier.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Azure VM Setup](#azure-vm-setup)
- [Deployment Process](#deployment-process)
- [Common Issues & Solutions](#common-issues--solutions)
- [Post-Deployment](#post-deployment)

---

## Prerequisites

### Local Requirements
- Git repository with `azure-deploy` branch
- SSH key pair for VM access

### Azure Account
- Active Azure account with free tier access
- Free tier includes:
  - **$200 credit** for 30 days (new customers only)
  - **750 hours/month** of B1S VM (1 vCPU, 1 GB RAM) for 12 months
  - **32 GB** managed disk storage
  - **15 GB** outbound data transfer/month
  - **Azure Database for PostgreSQL** Flexible Server (B1MS, 32 GB storage)
  - **Azure Database for MySQL** Flexible Server (B1MS, 32 GB storage)

---

## Azure VM Setup

> [!IMPORTANT]
> **B1S Availability Issue**: The B1S VM size may not be available in all regions for your subscription. If you see the error **"This size is currently unavailable in [region] for this subscription: NotAvailableForSubscription"**, try one of these regions where B1S is typically available:
> - ✅ **East US** (recommended)
> - ✅ **West US**
> - ✅ **West Europe**
> - ✅ **Southeast Asia**
> - ✅ **Central US**
> 
> Avoid: East US 2, West US 2, North Europe (often unavailable for B1S)

### 1. Create Virtual Machine

**Navigate to Azure Portal:**
1. Go to https://portal.azure.com
2. Click **"Create a resource"** → **"Virtual Machine"**

**Basic Configuration:**

**Project Details:**
- **Subscription**: Your Azure subscription
- **Resource Group**: Create new (e.g., `task-scheduler-rg`)

**Instance Details:**
- **Virtual machine name**: `task-scheduler-vm` (or your choice)
- **Region**: ⚠️ **Important**: Choose a region where B1S is available (see note above)
  - Recommended: `East US`, `West US`, `West Europe`, `Southeast Asia`, or `Central US`
  - Avoid: `East US 2`, `West US 2` (often unavailable for B1S)
- **Availability options**: No infrastructure redundancy required
- **Security type**: Standard
- **Image**: Ubuntu Server 24.04 LTS - x64 Gen2
- **VM architecture**: x64
- **Size**: **B1s** (1 vCPU, 1 GB RAM) - Free tier eligible
  - Click "See all sizes" if not visible
  - Filter by "B-series" to find B1s

**Administrator Account:**
- **Authentication type**: SSH public key (recommended) or Password
- **Username**: `azureuser` (default) or your choice
- **SSH public key source**: 
  - Generate new key pair (Azure will let you download)
  - Or use existing public key from `~/.ssh/id_rsa.pub`
- **Key pair name**: `task-scheduler-key` (if generating new)

**Inbound Port Rules:**
- **Public inbound ports**: Allow selected ports
- **Select inbound ports**: 
  - ✅ SSH (22)
  - ✅ HTTP (80)

### 2. Configure Disks

Click **"Next: Disks"**

- **OS disk size**: Default (30 GB)
- **OS disk type**: **Standard HDD** (LRS) - Most cost-effective for demos
- **Delete with VM**: ✅ Enabled (cleanup on deletion)
- **Encryption type**: Default (Platform-managed key)

### 3. Configure Networking

Click **"Next: Networking"**

**Network Interface:**
- **Virtual network**: (auto-created) or create new
- **Subnet**: default
- **Public IP**: (new) - Auto-assigned
- **NIC network security group**: Basic
- **Public inbound ports**: Allow selected ports
- **Select inbound ports**: SSH (22), HTTP (80)

**Delete public IP and NIC when VM is deleted**: ✅ Enabled

### 4. Review + Create

1. Click **"Review + create"**
2. Verify configuration:
   - Size: B1s (1 vCPU, 1 GB RAM)
   - Image: Ubuntu Server 24.04 LTS
   - Ports: 22, 80 open
3. Review estimated cost: **$0.00/month** (free tier)
4. Click **"Create"**

**Download SSH Key (if generated):**
- Azure will prompt to download `.pem` file
- Save securely (e.g., `~/Downloads/task-scheduler-key.pem`)
- Set permissions: `chmod 400 ~/Downloads/task-scheduler-key.pem`

### 5. Connect to VM

**Get Public IP Address:**
1. Go to **"Virtual machines"** → Select your VM
2. Copy **"Public IP address"** from overview page

**Option 1: SSH with Key Pair**
```bash
# If you generated key via Azure
ssh -i ~/Downloads/task-scheduler-key.pem azureuser@<PUBLIC-IP>

# If you used existing key
ssh azureuser@<PUBLIC-IP>
```

**Option 2: Azure Cloud Shell (Browser-based)**
1. In Azure Portal, click **Cloud Shell** icon (top right)
2. Select **Bash**
3. Run:
   ```bash
   ssh azureuser@<PUBLIC-IP>
   ```

**Option 3: Azure Bastion (No public IP needed)**
1. In VM overview, click **"Connect"** → **"Bastion"**
2. Enter username and SSH private key
3. Click **"Connect"**

---

## Deployment Process

### 1. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add user to docker group
sudo usermod -aG docker azureuser && newgrp docker

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

### 5. Scale for B1S (1 GB RAM)

The default configuration (3 schedulers, 5 workers) uses ~400-500 MB. For B1S:

```bash
# Stop services
docker compose -f docker-compose.prod.yml down

# Start with reduced scale
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=1 --scale worker=2
```

**Recommended Scale for B1S:**
- 1 Scheduler
- 2 Workers
- Total memory usage: ~300-400 MB (safe for 1 GB RAM)

---

## Common Issues & Solutions

### Issue 1: B1S VM Size Not Available in Region

**Symptom:**
```
This size is currently unavailable in [region] for this subscription: NotAvailableForSubscription
```

**Cause:** B1S VM size is not available in all Azure regions. Some regions (like East US 2, West US 2) frequently have this limitation.

**Solution:**

1. **Change Region During VM Creation:**
   - In the VM creation wizard, change the **Region** dropdown
   - Try these regions (typically have B1S available):
     - ✅ East US
     - ✅ West US
     - ✅ West Europe
     - ✅ Southeast Asia
     - ✅ Central US

2. **Verify B1S Availability:**
   - After selecting a region, click **"See all sizes"** in the Size dropdown
   - Search for "B1s" in the filter
   - If B1S appears in the list, it's available in that region

3. **Alternative: Use B1MS (Slightly Higher Specs):**
   - If B1S is unavailable in all regions, try **B1MS** (1 vCPU, 2 GB RAM)
   - Still free tier eligible for 12 months (750 hours/month)
   - Better performance but uses more memory
   - Adjust scaling: Can run 1 scheduler + 3 workers comfortably

4. **Check Azure Service Health:**
   - Go to Azure Portal → **"Service Health"**
   - Check for any regional outages or capacity issues

**Note:** Region availability can change. If a region doesn't work today, it might work tomorrow, or vice versa.

### Issue 2: Database Password Authentication Failed

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

### Issue 7: VM Running Out of Memory

**Symptom:** Services crashing, `docker stats` shows high memory usage.

**Solution:** Add swap space:
```bash
# Add 1 GB swap space
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap is active
free -h
```

---

## Post-Deployment

### Access Your Application

Your app is now live at: `http://<AZURE-VM-PUBLIC-IP>`

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

### Adding a Custom Domain

#### Option 1: Free Subdomain with DuckDNS (Recommended)

DuckDNS provides free subdomains that are perfect for demo projects and portfolios.

**Step 1: Create DuckDNS Account**
1. Go to https://www.duckdns.org
2. Sign in with GitHub, Google, Reddit, or Twitter
3. No email verification required - instant access

**Step 2: Create Your Subdomain**
1. In the "sub domain" field, enter your desired name (e.g., `distributed-scheduler`)
2. Click "add domain"
3. You'll see: `success: domain distributed-scheduler.duckdns.org added to your account`

**Step 3: Point to Your Azure VM IP**
1. Find your VM public IP:
   ```bash
   # On Azure VM
   curl -4 icanhazip.com
   ```
   Or get from Azure Portal: VM → Overview → Public IP address

2. On DuckDNS website, enter your VM IP in the "current ip" field
3. Click "update ip"
4. You'll see: `OK` response

**Step 4: Verify DNS Resolution**
```bash
# On Azure VM
nslookup distributed-scheduler.duckdns.org

# Should show:
# Name:   distributed-scheduler.duckdns.org
# Address: <your-vm-ip>
```

**Step 5: Set Up Auto-Update (Important!)**

Azure VMs can have dynamic IPs. Set up automatic updates:

```bash
# On Azure VM, create update script
# Replace YOUR_TOKEN with your token from DuckDNS website
echo "curl 'https://www.duckdns.org/update?domains=distributed-scheduler&token=YOUR_TOKEN&ip='" | sudo tee /usr/local/bin/duckdns-update.sh

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

**Step 6: Access Your Application**

Your app is now accessible at:
- ✅ **http://distributed-scheduler.duckdns.org** (custom domain)
- ✅ **http://\<AZURE-VM-IP\>** (still works)

**Note on HTTPS:**
- DuckDNS domains use HTTP by default
- For HTTPS, you can add Let's Encrypt SSL (see HTTPS Setup section below)
- For demo/portfolio projects, HTTP is acceptable

#### Option 2: Azure DNS + Custom Domain

If you own a domain or want to purchase one:

1. **Create DNS Zone in Azure**
   ```bash
   # Via Azure Portal:
   # Search "DNS zones" → Create DNS zone
   # Enter your domain name (e.g., yourdomain.com)
   # Resource group: task-scheduler-rg
   # Click "Create"
   ```

2. **Add A Record**
   - Go to your DNS zone
   - Click **"+ Record set"**
   - Name: `scheduler` (or `@` for root domain)
   - Type: `A`
   - TTL: 300
   - IP address: Your VM public IP
   - Click **"OK"**

3. **Update Nameservers** (at your domain registrar)
   - Copy the 4 NS records from Azure DNS zone
   - Update nameservers at your domain registrar (GoDaddy, Namecheap, etc.)

4. **Wait for DNS Propagation** (5-60 minutes)
   ```bash
   # Check DNS propagation
   nslookup scheduler.yourdomain.com
   ```

**Cost:** ~$0.50/month for DNS zone + domain registration fee (~$12/year)

#### Option 3: Static Public IP (Prevents IP Changes)

To keep a permanent IP address:

**Via Azure Portal:**
1. Go to **"Public IP addresses"** → **"Create"**
2. Name: `task-scheduler-ip`
3. SKU: **Basic** (free tier compatible)
4. Assignment: **Static**
5. Resource group: `task-scheduler-rg`
6. Click **"Create"**

**Associate with VM:**
1. Go to your VM → **"Networking"** → **"Network Interface"**
2. Click on the network interface name
3. **"IP configurations"** → Click on the IP configuration
4. Public IP address: Select your static IP
5. Click **"Save"**

**Benefits:**
- IP never changes (even after stop/start)
- No need for DuckDNS auto-update

**Cost:**
- ✅ Free while associated with running VM
- ⚠️ ~$3.65/month if VM is stopped (IP reserved but not in use)

---

### HTTPS Setup (Optional)

Adding HTTPS gives you the green padlock and encrypted traffic.

#### Option A: Let's Encrypt with Certbot

**Requirements:**
- Custom domain (DuckDNS or your own)
- Port 443 open in Azure NSG

**Steps:**

1. **Open Port 443 in Network Security Group**
   ```bash
   # Via Azure Portal:
   # VM → Networking → Add inbound port rule
   # Destination port ranges: 443
   # Protocol: TCP
   # Name: HTTPS
   # Click "Add"
   ```

2. **Install Certbot**
   ```bash
   # On Azure VM
   sudo snap install --classic certbot
   sudo ln -s /snap/bin/certbot /usr/bin/certbot
   ```

3. **Stop Nginx Temporarily**
   ```bash
   docker compose -f docker-compose.prod.yml stop nginx
   ```

4. **Get SSL Certificate**
   ```bash
   sudo certbot certonly --standalone -d distributed-scheduler.duckdns.org
   
   # Follow prompts:
   # - Enter email
   # - Agree to terms
   # - Certificates saved to: /etc/letsencrypt/live/distributed-scheduler.duckdns.org/
   ```

5. **Update Nginx Configuration**
   
   Create `Client/nginx-ssl.conf`:
   ```nginx
   server {
       listen 80;
       server_name distributed-scheduler.duckdns.org;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl;
       server_name distributed-scheduler.duckdns.org;
       
       ssl_certificate /etc/letsencrypt/live/distributed-scheduler.duckdns.org/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/distributed-scheduler.duckdns.org/privkey.pem;
       
       # ... rest of your nginx config
   }
   ```

6. **Update docker-compose.prod.yml**
   ```yaml
   nginx:
     volumes:
       - /etc/letsencrypt:/etc/letsencrypt:ro
     ports:
       - "80:80"
       - "443:443"
   ```

7. **Restart Nginx**
   ```bash
   docker compose -f docker-compose.prod.yml up -d nginx
   ```

8. **Set Up Auto-Renewal**
   ```bash
   # Test renewal
   sudo certbot renew --dry-run
   
   # Add to crontab (renews every 12 hours)
   echo "0 */12 * * * certbot renew --quiet --deploy-hook 'docker compose -f ~/distributed-task-scheduler/docker-compose.prod.yml restart nginx'" | sudo crontab -
   ```

**Access:** https://distributed-scheduler.duckdns.org ✅

#### Option B: Cloudflare (Easiest)

1. Sign up at https://dash.cloudflare.com
2. Add your domain
3. Update nameservers at your registrar
4. Enable **"Flexible SSL"** in Cloudflare dashboard
5. Access via HTTPS (Cloudflare handles SSL termination)

**Benefits:**
- No server configuration needed
- Free SSL certificate
- CDN and DDoS protection included

---

### DNS and Domain FAQ

**Q: Will my DuckDNS domain expire?**
A: No, as long as you update it at least once every 30 days (auto-update script handles this).

**Q: Can I use HTTPS with DuckDNS?**
A: Yes, using Let's Encrypt (see HTTPS Setup section above).

**Q: What happens if my Azure VM IP changes?**
A: The auto-update cron job will detect and update DuckDNS automatically within 5 minutes.

**Q: Is HTTP okay for a demo project?**
A: Yes! Most technical reviewers understand HTTP is fine for demos. Just mention "HTTPS can be added via Let's Encrypt" in your README.

**Q: How much does a custom domain cost?**
A: DuckDNS is free. Purchased domains cost ~$12/year + $0.50/month for Azure DNS zone.

---

### Cost Optimization

**Current Setup (B1S):**
- **Free Tier**: 750 hours/month (free for first 12 months)
- **After Free Tier**: ~$7-9/month

**Memory Usage:**
- 1 Scheduler + 2 Workers: ~300-400 MB
- Leaves ~600 MB for OS and bursts

**Monitoring Free Tier Usage:**
1. Go to Azure Portal → **"Cost Management + Billing"**
2. Click **"Cost Management"** → **"Cost analysis"**
3. View current month's usage
4. Set up budget alerts:
   - **"Budgets"** → **"Add"**
   - Amount: $5 (or desired threshold)
   - Alert at 80%, 100%

**Stop VM When Not in Use:**
```bash
# Via Azure Portal:
# VM → Stop (deallocated state = no compute charges)

# Via Azure CLI:
az vm deallocate --resource-group task-scheduler-rg --name task-scheduler-vm

# Start again:
az vm start --resource-group task-scheduler-rg --name task-scheduler-vm
```

**Note:** Stopping VM deallocates it, so public IP may change unless using static IP.

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
   docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "\\dt"
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
   docker compose -f docker-compose.prod.yml exec postgres psql -U scheduler -d task_scheduler -c "\\dv"
   ```

7. **Hard refresh browser** to clear cache

8. **Check Azure VM resource usage:**
   ```bash
   # Memory usage
   free -h
   
   # Disk usage
   df -h
   
   # CPU usage
   top
   ```

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

**Resource Allocation (B1S - 1 GB RAM):**
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
2. ⚠️ Restrict SSH to your IP only (NSG rule)
3. ⚠️ Add HTTPS (Let's Encrypt) for production
4. ⚠️ Use Azure Key Vault for sensitive data
5. ⚠️ Enable Azure Monitor for logging
6. ⚠️ Set up automated backups (Azure Backup)

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

**Congratulations! Your distributed task scheduler is now live on Azure! 🚀**
