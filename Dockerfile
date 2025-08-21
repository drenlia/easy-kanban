# Multi-stage build for Kanban application

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server/ ./server/

# Stage 3: Production runtime
FROM node:20-alpine AS production
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/dist ./public

# Copy backend from stage 2
COPY --from=backend-builder /app/server ./server

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S kanban -u 1001

# Create necessary directories and set permissions
RUN mkdir -p /app/server/data /app/server/attachments && \
    chown -R kanban:nodejs /app

# Switch to non-root user
USER kanban

# Expose backend port
EXPOSE 3222

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3222/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))" || exit 1

# Start the application
CMD ["node", "server/index.js"]
