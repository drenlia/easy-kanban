# Development Dockerfile for Easy Kanban

FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p /app/server/data /app/server/attachments

# Expose both ports
EXPOSE 3010 3222

# Start the development environment
CMD ["npm", "run", "dev"]
