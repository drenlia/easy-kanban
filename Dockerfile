# Development Dockerfile for Easy Kanban

FROM node:22-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3 (needed for native compilation)
RUN apk add --no-cache python3 make g++

# Install dependencies first (this will be preserved in the container)
# Try npm ci first (deterministic), fall back to npm install if lock file is out of sync
COPY package*.json ./
RUN npm ci --include=dev || npm install --include=dev

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p /app/server/data /app/server/attachments /app/server/avatars

# Ensure all dependencies are properly installed (including any missing ones)
RUN npm install --production=false


# Expose both ports
EXPOSE 3010 3222

# Start the development environment
CMD ["npm", "run", "dev"]
