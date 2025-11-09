# Docker Setup for Easy Kanban

This guide explains how to run the Easy Kanban application using Docker. **This application is designed to run exclusively in Docker containers** and includes all required services (Redis, database, etc.) automatically configured.

## Prerequisites

- Docker installed and running
- Docker Compose (V1 or V2) installed

**Note**: This setup works with both:
- Docker Compose V1 (`docker-compose` command)
- Docker Compose V2 (`docker compose` command)

## Current Status

✅ **Ready**: The application has been successfully containerized for development use with hot reloading.

## 🎯 **Port Information**

| Command | Frontend | Backend API | What You Get |
|---------|----------|-------------|--------------|
| `npm run docker:dev` | **http://localhost:3010** | **http://localhost:3222** | Development environment with hot reloading |

## Quick Start

### 1. Build and Run (Development Mode)

```bash
# Build and start the application (Docker Compose V2)
npm run docker:dev

# Or use docker compose directly (V2)
docker compose up --build

# For Docker Compose V1 users
npm run docker:dev-legacy
# Or: docker-compose up --build
```

**🚀 Access your application at:**
- **Frontend**: http://localhost:3010 (Vite dev server with hot reloading)
- **Backend API**: http://localhost:3222 (Express server)

## Available Commands

### Docker Compose V2 (Recommended)
```bash
# Build Docker image
npm run docker:build

# Run container directly
npm run docker:run

# Start development environment
npm run docker:dev

# Stop containers
npm run docker:stop

# Clean up containers and volumes
npm run docker:clean
```

### Docker Compose V1 (Legacy)
```bash
# Start development environment
npm run docker:dev-legacy

# Stop containers
npm run docker:stop-legacy

# Clean up containers and volumes
npm run docker:clean-legacy
```

## Docker Compose Configuration

### Development (`docker-compose.yml`)
- Single-stage build for development
- Hot reloading enabled
- Source code mounted for live updates
- Development dependencies included
- **Compatible with both V1 and V2** (no version field)

## Container Architecture

```
┌─────────────────────────────────────────────────┐
│         Docker Compose Stack                    │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │      Easy Kanban Container               │   │
│  │  ┌─────────────────────────────┐         │   │
│  │  │    Vite Dev Server          │         │   │  ← Port 3010
│  │  │   (Hot Reloading)           │         │   │
│  │  └─────────────────────────────┘         │   │
│  │  ┌─────────────────────────────┐         │   │
│  │  │    Express Backend          │         │   │  ← Port 3222
│  │  │     (API Server)            │         │   │
│  │  └─────────────────────────────┘         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │      Redis Container                    │   │
│  │  ┌─────────────────────────────┐         │   │
│  │  │    Redis Server             │         │   │  ← Port 6379
│  │  │   (Real-time updates)       │         │   │
│  │  └─────────────────────────────┘         │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Volumes

### Application Volumes
- `kanban-data`: SQLite database storage
- `kanban-attachments`: File upload storage
- `kanban-avatars`: User avatar storage
- `redis_data`: Redis persistent data storage

### Development Volumes
- `.:/app`: Source code mounted for hot reloading
- `/app/node_modules`: Node modules volume (preserves container modules)

## Environment Variables

### Core Configuration
- `NODE_ENV`: Set to 'development' or 'production'
- `DOCKER_ENV`: Set to 'true' (indicates Docker environment)
- `PORT`: Backend server port (default: 3222)
- `VITE_API_URL`: Frontend API endpoint

### Services
- `REDIS_URL`: Redis connection URL (automatically configured: `redis://redis:6379`)

### Security
- `JWT_SECRET`: Secret key for JWT authentication (should be changed in production)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

### Optional
- `DEMO_ENABLED`: Enable demo mode with hourly resets (default: false)
- `LICENSE_ENABLED`: Enable licensing features (default: false)
- `APP_VERSION`: Application version string

## Health Check

The application includes a health check endpoint at `/health` that:
- Verifies database connectivity
- Returns application status
- Used by Docker for container health monitoring

## Troubleshooting

### Container won't start
```bash
# Check logs
docker compose logs

# Check container status
docker compose ps
```

### Database issues
```bash
# Verify database file exists
ls -la server/kanban.db

# Check database permissions
docker exec -it easy-kanban ls -la /app/server/data
```

### Redis connection issues
```bash
# Check if Redis container is running
docker compose ps redis

# Check Redis logs
docker compose logs redis

# Verify Redis is accessible (check application logs for connection errors)
docker compose logs easy-kanban | grep -i redis
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
npm run docker:dev
```

## Development Features

### Hot Reloading
- Frontend changes are reflected immediately
- No need to restart containers
- Source maps for debugging

### Source Code Mounting
- Your local changes are immediately available in the container
- Edit files locally, see changes in the running app
- Preserves node_modules in the container

### Separate Frontend and Backend
- Frontend runs on port 3010 (Vite dev server)
- Backend runs on port 3222 (Express API)
- Clear separation of concerns

## Security Notes

⚠️ **Important**: For production deployments:

- Change the default admin password immediately after first login
- Set a strong `JWT_SECRET` in your environment variables
- Configure HTTPS/SSL for production
- Review and restrict `ALLOWED_ORIGINS` for CORS
- Consider additional network security measures (firewall, VPN, etc.)
- Regularly update Docker images and dependencies

## Performance Considerations

- **Development mode** prioritizes developer experience over performance
- **Hot reloading** may use more resources
- **Source maps** increase bundle size
- **Volume mounting** may impact I/O performance

## Why Docker Only?

This application is designed to run exclusively in Docker containers because:

- **Redis Dependency**: The application requires Redis for real-time updates and caching. Docker Compose automatically sets up and configures Redis.
- **Consistent Environment**: Docker ensures the same environment across development, staging, and production.
- **Simplified Setup**: No need to manually install and configure Node.js, Redis, or other dependencies.
- **Isolated Services**: All services (application, Redis, database) run in isolated containers with proper networking.
- **Easy Deployment**: Containerized applications are easier to deploy and scale.

## Support

For issues or questions:
1. Check the logs: `docker compose logs`
2. Verify Docker is running: `docker info`
3. Check container health: `docker compose ps`
4. Review this documentation

## Services Included

The Docker Compose setup automatically includes:

1. **Easy Kanban Application**: Main application container with frontend and backend
2. **Redis**: In-memory data store for real-time updates and caching
3. **Persistent Volumes**: Data persistence for database, attachments, avatars, and Redis

All services are automatically configured and connected. No manual setup required!

## Recent Updates

- **Docker-Only Approach**: Application designed exclusively for Docker deployment
- **Redis Integration**: Redis service automatically included and configured
- **Docker Compose V2 Compatibility**: Removed version field for modern compatibility
- **Dual Command Support**: Added both `docker compose` and `docker-compose` commands
- **Hot Reloading**: Optimized for development workflow
- **Clear Port Configuration**: Frontend on 3010, Backend on 3222, Redis on 6379
