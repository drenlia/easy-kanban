# Development Dockerfile for Easy Kanban

FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S kanban -u 1001

# Create necessary directories and set permissions
RUN mkdir -p /app/server/data /app/server/attachments

# Don't switch user - run as root to handle mounted volumes

# Expose both ports
EXPOSE 3010 3222

# Start the development environment
CMD ["npm", "run", "dev"]
