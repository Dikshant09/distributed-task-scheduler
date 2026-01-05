FROM node:20-alpine

WORKDIR /app

# Install Docker CLI for reset instances functionality
# This allows the API container to scale services via docker compose
RUN apk add --no-cache docker-cli docker-cli-compose

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Default command (can be overridden in docker-compose)
CMD ["node", "api/server.js"]
