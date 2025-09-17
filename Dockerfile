# Development Dockerfile for Easy Kanban

FROM node:20-alpine

WORKDIR /app

# Install dependencies first (this will be preserved in the container)
COPY package*.json ./
RUN npm ci

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
