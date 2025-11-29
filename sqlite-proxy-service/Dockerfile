# SQLite Proxy Service - Standalone Dockerfile
# Minimal image with only the proxy service dependencies

FROM node:22-alpine

# Install build dependencies for better-sqlite3 (needed for native compilation)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
# Try npm ci first (deterministic), fall back to npm install if lock file is out of sync
RUN npm ci --only=production || npm install --only=production

# Copy application code
COPY index.js ./

# Create data directory (will be mounted from NFS)
RUN mkdir -p /app/server/data

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S proxyuser -u 1001 -G nodejs

# Change ownership
RUN chown -R proxyuser:nodejs /app

# Switch to non-root user
USER proxyuser

# Expose proxy port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Run proxy service
CMD ["node", "index.js"]

