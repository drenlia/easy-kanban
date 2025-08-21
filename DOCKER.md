# Docker Setup for Easy Kanban

This guide explains how to run the Easy Kanban application using Docker.

## Prerequisites

- Docker installed and running
- Docker Compose (V1 or V2) installed
- Node.js 20+ (for local development)

**Note**: This setup works with both:
- Docker Compose V1 (`docker-compose` command)
- Docker Compose V2 (`docker compose` command)

## Current Status

⚠️ **Note**: The application has been successfully containerized, but there are some known issues:
- Container may exit unexpectedly (exit code 137)
- This is typically related to resource constraints or memory issues
- The application works when running but may need monitoring

## 🎯 **IMPORTANT: Port Information**

| Mode | Command | Access URL | What You Get |
|------|---------|------------|--------------|
| **Production** | `npm run docker:prod` | **http://localhost:3222** | Frontend + Backend together |
| **Development** | `npm run docker:dev` | Frontend: 3010, Backend: 3222 | Separate servers with hot reloading |

## Quick Start

### 1. Build and Run (Production Mode) - **RECOMMENDED**

```bash
# Build and start the application (Docker Compose V2)
npm run docker:prod

# Or use docker compose directly (V2)
docker compose up --build

# For Docker Compose V1 users
npm run docker:prod-legacy
# Or: docker-compose up --build
```

**🚀 Access your application at: http://localhost:3222**

**Note**: In production mode, everything runs on port 3222 - both the frontend and backend are served together.

### 2. Development Mode (with Hot Reloading)

```bash
# Start in development mode (Docker Compose V2)
npm run docker:dev

# Or use docker compose directly (V2)
docker compose -f docker-compose.dev.yml up --build

# For Docker Compose V1 users
npm run docker:dev-legacy
# Or: docker-compose -f docker-compose.dev.yml up --build
```

## Available Commands

### Docker Compose V2 (Recommended)
```bash
# Build Docker image
npm run docker:build

# Run container directly
npm run docker:run

# Start production environment
npm run docker:prod

# Start development environment
npm run docker:dev

# Stop containers
npm run docker:stop

# Clean up containers and volumes
npm run docker:clean
```

### Docker Compose V1 (Legacy)
```bash
# Start production environment
npm run docker:prod-legacy

# Start development environment
npm run docker:dev-legacy

# Stop containers
npm run docker:stop-legacy

# Clean up containers and volumes
npm run docker:clean-legacy
```

## Port Configuration

### Production Mode (`npm run docker:prod`)
- **Single Port**: http://localhost:3222
- **What it serves**: Frontend + Backend API together
- **Why one port**: Built frontend is served by the backend server
- **Best for**: Production use, simple deployment, end users

### Development Mode (`npm run docker:dev`)
- **Two Ports**: 
  - Frontend: http://localhost:3010 (Vite dev server)
  - Backend: http://localhost:3222 (API server)
- **What it serves**: Separate frontend dev server + backend API
- **Why two ports**: Hot reloading, source maps, faster development
- **Best for**: Development, debugging, code changes

## Docker Compose Files

### Production (`docker-compose.yml`)
- Multi-stage build for optimized production image
- Serves built frontend from backend
- Health checks enabled
- Persistent volumes for data and attachments

### Development (`docker-compose.dev.yml`)
- Hot reloading enabled
- Source code mounted for live updates
- Development dependencies included

## Container Architecture

```
┌─────────────────────────────────────┐
│           Easy Kanban               │
│  ┌─────────────────────────────┐    │
│  │        Frontend             │    │
│  │     (Built React App)       │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │        Backend              │    │
│  │     (Express + SQLite)      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## Volumes

- `kanban-data`: SQLite database storage
- `kanban-attachments`: File upload storage
- `./server/kanban.db`: Database file (mounted for easy access)

## Environment Variables

- `NODE_ENV`: Set to 'production' or 'development'
- `PORT`: Backend server port (default: 3222)
- `VITE_API_URL`: Frontend API endpoint

## Health Check

The application includes a health check endpoint at `/health` that:
- Verifies database connectivity
- Returns application status
- Used by Docker for container health monitoring

## Known Issues & Troubleshooting

### Port Confusion - Common Issue!

**❌ Don't do this**: Trying to access http://localhost:3010 in production mode
**✅ Do this instead**: Access http://localhost:3222 in production mode

**Why this happens:**
- Production mode serves everything from port 3222
- Port 3010 is only used in development mode
- The frontend and backend are combined in production

**Quick fix:**
```bash
# If you're in production mode, use:
http://localhost:3222

# If you want separate ports, use development mode:
npm run docker:dev
# Then access: Frontend: 3010, Backend: 3222
```

### Container Exits Unexpectedly (Exit Code 137)

**Symptoms:**
- Container starts successfully but exits after a few seconds
- Exit code 137 in logs
- "Server running on port 3222" message appears before exit

**Possible Causes:**
1. **Memory constraints** - Container may be hitting memory limits
2. **Resource limits** - Docker daemon resource restrictions
3. **Process signal** - Container being killed by system

**Solutions:**

#### 1. Increase Docker Resources
```bash
# Check current Docker resource limits
docker system df

# Increase memory limit in Docker Desktop settings
# Or modify docker-compose.yml to add resource limits
```

#### 2. Add Resource Limits to docker-compose.yml
```yaml
services:
  kanban-app:
    # ... existing config ...
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

#### 3. Monitor Container Resources
```bash
# Watch container resource usage
docker stats easy-kanban

# Check container logs for errors
docker compose logs -f
```

#### 4. Alternative: Run in Foreground Mode
```bash
# Run without detaching to see real-time output
docker compose up --build

# Or use the development mode which may be more stable
npm run docker:dev
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs

# Check container status
docker-compose ps
```

### Database issues
```bash
# Verify database file exists
ls -la server/kanban.db

# Check database permissions
docker exec -it easy-kanban ls -la /app/server/data
```

### Port conflicts
```bash
# Check what's using the ports
sudo netstat -tulpn | grep :3010
sudo netstat -tulpn | grep :3222

# Modify ports in docker-compose.yml if needed
```

### Clean rebuild
```bash
# Remove all containers and rebuild
npm run docker:clean
npm run docker:prod
```

## Production Deployment

For production deployment, consider:

1. **Reverse Proxy**: Use Nginx or Traefik
2. **SSL/TLS**: Add HTTPS support
3. **Monitoring**: Implement logging and metrics
4. **Backup**: Regular database backups
5. **Security**: Network isolation and firewall rules

## Security Notes

⚠️ **Important**: This application currently has no authentication system. 
For production use, implement proper security measures:

- User authentication and authorization
- Input validation and sanitization
- Rate limiting
- HTTPS enforcement
- Network security

## Performance Tuning

- **Database**: Add indexes for frequently queried fields
- **Caching**: Implement Redis for session and data caching
- **CDN**: Use CDN for static assets
- **Load Balancing**: Multiple container instances behind a load balancer
- **Resource Limits**: Set appropriate Docker resource constraints

## Alternative Deployment Options

If you continue experiencing issues with the current Docker setup:

### 1. Use Development Mode
```bash
npm run docker:dev
# This mode may be more stable for testing
```

### 2. Run Backend Only in Docker
```bash
# Run backend in Docker, frontend locally
docker compose up --build kanban-app
npm run dev  # In another terminal
```

### 3. Use Docker Run Directly
```bash
# Skip docker-compose for simpler deployment
docker run -p 3222:3222 -v $(pwd)/server:/app/server easy-kanban
```

## Support

For issues or questions:
1. Check the logs: `docker compose logs`
2. Verify Docker is running: `docker info`
3. Check container health: `docker compose ps`
4. Monitor resources: `docker stats`
5. Review this documentation
6. Check the troubleshooting section above

## Recent Updates

- **Docker Compose V2 Compatibility**: Removed version field for modern compatibility
- **Dual Command Support**: Added both `docker compose` and `docker-compose` commands
- **Resource Monitoring**: Added troubleshooting for container exit issues
- **Health Checks**: Implemented container health monitoring
