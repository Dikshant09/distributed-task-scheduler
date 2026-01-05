FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Default command (can be overridden in docker-compose)
CMD ["node", "api/server.js"]
