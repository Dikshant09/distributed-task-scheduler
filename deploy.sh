#!/bin/bash
# Deploy script for Azure VM

set -e

echo "🚀 Starting Distributed Task Scheduler deployment..."

# Check if .env.prod exists
if [ ! -f ".env.prod" ]; then
    echo "Creating .env.prod with random password..."
    echo "DB_PASSWORD=$(openssl rand -hex 16)" > .env.prod
    echo "NODE_ENV=production" >> .env.prod
fi

# Build and start services
echo "📦 Building Docker images..."
docker compose -f docker-compose.prod.yml build

echo "🔧 Starting services..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale scheduler=3 --scale worker=5

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Health check
echo "🏥 Running health checks..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ API is healthy"
else
    echo "⚠️  API health check failed, checking logs..."
    docker compose -f docker-compose.prod.yml logs api --tail=20
fi

# Show status
echo ""
echo "📊 Service Status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Deployment complete!"
echo "🌐 Access the application at: http://$(curl -s ifconfig.me 2>/dev/null || echo 'localhost')"
echo ""
echo "📝 Useful commands:"
echo "  View logs:     docker compose -f docker-compose.prod.yml logs -f"
echo "  Stop:          docker compose -f docker-compose.prod.yml down"
echo "  Restart:       docker compose -f docker-compose.prod.yml restart"
