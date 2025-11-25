import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';
import redisService from './redisService.js';
import { JWT_SECRET } from '../middleware/auth.js';
import { extractTenantId, getTenantDatabase } from '../middleware/tenantRouting.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
    this.redisPubClient = null;
    this.redisSubClient = null;
  }

  async initialize(server) {
    // CORS configuration for WebSocket
    // In multi-tenant mode, nginx handles CORS validation for HTTP requests
    // For WebSocket, we allow all origins in multi-tenant mode (nginx will validate)
    // In single-tenant mode, use ALLOWED_ORIGINS from environment
    const allowedOrigins = process.env.MULTI_TENANT === 'true' 
      ? true  // Allow all origins in multi-tenant (nginx validates)
      : (process.env.ALLOWED_ORIGINS?.split(',') || true);
    
    this.io = new SocketIOServer(server, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000, // 60 seconds - how long to wait for pong before closing
      pingInterval: 25000, // 25 seconds - how often to ping
      upgradeTimeout: 30000, // 30 seconds - time to wait for upgrade
      transports: ['polling', 'websocket'], // Try polling first for better compatibility
      allowEIO3: true, // Allow Engine.IO v3 clients
      // Add error handling for Socket.IO requests
      allowRequest: (req, callback) => {
        // Log request details for debugging
        if (process.env.MULTI_TENANT === 'true') {
          const hostname = req.headers.host || req.headers['x-forwarded-host'] || '';
          const tenantId = extractTenantId(hostname);
          console.log(`🔍 Socket.IO request - Host: ${req.headers.host}, X-Forwarded-Host: ${req.headers['x-forwarded-host']}, Tenant: ${tenantId || 'none'}`);
        }
        callback(null, true); // Allow all requests (authentication happens in middleware)
      }
    });

    // Configure Redis adapter for Socket.IO to share sessions across multiple pods
    // This is critical for multi-pod deployments where load balancing can route
    // Socket.IO polling requests to different pods than where the session was created
    // 
    // Only use Redis adapter when:
    // 1. Multi-tenant mode is enabled (always needs adapter for pod scaling)
    // 2. Explicitly enabled via USE_REDIS_ADAPTER env var (for multi-pod single-tenant deployments)
    // 
    // In single-tenant Docker with single instance, use in-memory adapter (faster, simpler)
    const useRedisAdapter = process.env.MULTI_TENANT === 'true' || process.env.USE_REDIS_ADAPTER === 'true';
    
    if (useRedisAdapter) {
      try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        // Create separate Redis clients for Socket.IO adapter (pub/sub pattern)
        this.redisPubClient = createClient({ url: redisUrl });
        this.redisSubClient = this.redisPubClient.duplicate();
        
        await Promise.all([
          this.redisPubClient.connect(),
          this.redisSubClient.connect()
        ]);
        
        // Set up the Redis adapter
        // Note: The adapter automatically handles session storage in Redis
        // Sessions are stored with keys like "socket.io#/#" prefix
        const adapter = createAdapter(this.redisPubClient, this.redisSubClient);
        this.io.adapter(adapter);
        console.log('✅ Socket.IO Redis adapter configured - sessions will be shared across all pods');
        console.log('   Redis URL:', redisUrl);
        console.log('   Adapter type:', adapter.constructor.name);
        console.log('   Mode:', process.env.MULTI_TENANT === 'true' ? 'multi-tenant' : 'multi-pod single-tenant');
      } catch (error) {
        console.error('❌ Failed to configure Socket.IO Redis adapter:', error);
        console.warn('⚠️ Socket.IO will use in-memory adapter (sessions not shared across pods)');
        // Continue without Redis adapter - Socket.IO will use default in-memory adapter
        // This is acceptable for single-pod deployments but will cause issues with multiple pods
      }
    } else {
      console.log('ℹ️ Socket.IO using in-memory adapter (single-instance mode)');
      console.log('   Redis is still used for pub/sub messaging (real-time updates)');
      console.log('   To enable Redis adapter for multi-pod deployments, set USE_REDIS_ADAPTER=true');
    }
    
    
    // Add authentication middleware
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        console.log('❌ WebSocket auth failed: No token provided');
        return next(new Error('Authentication required'));
      }
      
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          console.log('❌ WebSocket auth failed:', err.message);
          return next(new Error('Invalid token'));
        }
        
        // Extract tenant ID from hostname (for multi-tenant isolation)
        const hostname = socket.handshake.headers.host || socket.handshake.headers['x-forwarded-host'] || '';
        const tenantId = extractTenantId(hostname);
        
        // In multi-tenant mode, verify user exists in the tenant's database
        if (process.env.MULTI_TENANT === 'true' && tenantId) {
          try {
            const dbInfo = getTenantDatabase(tenantId);
            if (dbInfo && dbInfo.db) {
              const userInDb = dbInfo.db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.id);
              if (!userInDb) {
                console.log(`❌ WebSocket auth failed: User ${decoded.email} (${decoded.id}) does not exist in tenant ${tenantId}'s database`);
                return next(new Error('Invalid token for this tenant'));
              }
              console.log(`✅ WebSocket tenant validation passed: User ${decoded.email} exists in tenant ${tenantId}`);
            } else {
              console.warn(`⚠️ WebSocket auth: Could not get database for tenant ${tenantId}`);
            }
          } catch (dbError) {
            console.error('❌ Error checking user in tenant database for WebSocket:', dbError);
            console.error('❌ Error details:', dbError.message, dbError.stack);
            return next(new Error('Authentication failed'));
          }
        } else if (process.env.MULTI_TENANT === 'true' && !tenantId) {
          console.warn(`⚠️ WebSocket auth: Multi-tenant mode but no tenant ID extracted from hostname: ${hostname}`);
        }
        
        // Attach user info to socket
        socket.userId = decoded.id;
        socket.userEmail = decoded.email;
        socket.userRole = decoded.role;
        socket.userRoles = decoded.roles;
        socket.tenantId = tenantId; // Store tenantId for room isolation
        
        console.log('✅ WebSocket authenticated:', decoded.email, tenantId ? `(tenant: ${tenantId})` : '');
        next();
      });
    });
    

    // Handle connection errors
    this.io.engine.on('connection_error', (err) => {
      console.error('❌ Socket.IO connection error:', err);
      console.error('❌ Error details:', err.message, err.context);
    });

    // Handle connections
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id} (${socket.userEmail})`);
      
      // Log tenant context for debugging
      if (socket.tenantId) {
        console.log(`   📍 Tenant context: ${socket.tenantId}`);
      }
      
      this.connectedClients.set(socket.id, { 
        socketId: socket.id, 
        userId: socket.userId,
        userEmail: socket.userEmail,
        userRole: socket.userRole,
        tenantId: socket.tenantId
      });

      // Join tenant namespace (for tenant-wide broadcasts in multi-tenant mode)
      if (socket.tenantId) {
        socket.join(`tenant-${socket.tenantId}`);
      }

      // Join board room (tenant-aware in multi-tenant mode)
      socket.on('join-board', (boardId) => {
        const timestamp = new Date().toISOString();
        // Use tenant-prefixed room in multi-tenant mode
        const room = socket.tenantId 
          ? `tenant-${socket.tenantId}-board-${boardId}`
          : `board-${boardId}`;
        
        console.log(`📋 [${timestamp}] Client ${socket.id} (${socket.userEmail}) joining board room: ${room}`);
        
        // For now, allow all authenticated users to join any board
        // TODO: Add proper board access control based on user permissions
        socket.join(room);
        this.connectedClients.set(socket.id, { 
          socketId: socket.id, 
          userId: socket.userId,
          userEmail: socket.userEmail,
          userRole: socket.userRole,
          tenantId: socket.tenantId,
          boardId 
        });
        
        // Check how many clients are now in the room
        const clientsInRoom = this.io.sockets.adapter.rooms.get(room)?.size || 0;
        console.log(`✅ [${timestamp}] Client joined room ${room}. Total clients in room: ${clientsInRoom}`);
        
        // Send confirmation back to client
        socket.emit('joined-room', { boardId, room });
      });

      // Leave board room (tenant-aware in multi-tenant mode)
      socket.on('leave-board', (boardId) => {
        const room = socket.tenantId 
          ? `tenant-${socket.tenantId}-board-${boardId}`
          : `board-${boardId}`;
        socket.leave(room);
        this.connectedClients.set(socket.id, { 
          socketId: socket.id, 
          userId: socket.userId,
          userEmail: socket.userEmail,
          userRole: socket.userRole,
          tenantId: socket.tenantId
        });
      });

      // Handle user activity (tenant-aware in multi-tenant mode)
      socket.on('user-activity', (data) => {
        // Broadcast user activity to other clients on the same board
        const client = this.connectedClients.get(socket.id);
        if (client?.boardId) {
          const room = client.tenantId 
            ? `tenant-${client.tenantId}-board-${client.boardId}`
            : `board-${client.boardId}`;
          socket.to(room).emit('user-activity', {
            ...data,
            socketId: socket.id,
            userId: socket.userId,
            userEmail: socket.userEmail
          });
        }
      });

      socket.on('disconnect', (reason) => {
        console.log(`🔴 Client disconnected: ${socket.id} (${socket.userEmail}) - Reason: ${reason}`);
        this.connectedClients.delete(socket.id);
      });

      socket.on('error', (error) => {
        console.error(`❌ Socket error for ${socket.id}:`, error.message);
      });
    });

    // Subscribe to Redis channels
    this.setupRedisSubscriptions();
  }

  // Get tenant-prefixed room name (for multi-tenant isolation)
  getTenantRoom(roomBase, tenantId, boardId) {
    if (tenantId && process.env.MULTI_TENANT === 'true') {
      return `tenant-${tenantId}-${roomBase}-${boardId}`;
    }
    return `${roomBase}-${boardId}`;
  }

  setupRedisSubscriptions() {
    // In multi-tenant mode, subscribe to all tenant channels using pattern matching
    // In single-tenant mode, subscribe to base channels
    
    // Task updates - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('task-updated', (data, tenantId) => {
      const timestamp = new Date().toISOString();
      console.log(`📡 [${timestamp}] WebSocket broadcasting task-updated (tenant: ${tenantId || 'single'}, task: ${data.task?.id})`);
      
      if (tenantId) {
        // Multi-tenant: broadcast only to clients of this tenant
        this.io?.to(`tenant-${tenantId}`).emit('task-updated', data);
      } else {
        // Single-tenant: broadcast to all clients
        this.io?.emit('task-updated', data);
      }
    });

    // Task created - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('task-created', (data, tenantId) => {
      const timestamp = new Date().toISOString();
      console.log(`📡 [${timestamp}] WebSocket received task-created (tenant: ${tenantId || 'single'})`);
      
      if (tenantId) {
        // Multi-tenant: broadcast only to clients of this tenant
        this.io?.to(`tenant-${tenantId}`).emit('task-created', data);
      } else {
        // Single-tenant: broadcast to all clients
        this.io?.emit('task-created', data);
      }
    });

    // Task deleted - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('task-deleted', (data, tenantId) => {
      const timestamp = new Date().toISOString();
      console.log(`📡 [${timestamp}] WebSocket broadcasting task-deleted (tenant: ${tenantId || 'single'})`);
      
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('task-deleted', data);
      } else {
        this.io?.emit('task-deleted', data);
      }
    });

    // Task relationship created - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('task-relationship-created', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('task-relationship-created', data);
    });

    // Task relationship deleted - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('task-relationship-deleted', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('task-relationship-deleted', data);
    });

    // Board created - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('board-created', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('board-created', data);
      } else {
        this.io?.emit('board-created', data);
      }
    });

    // Board updates - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('board-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('board-updated', data);
      } else {
        this.io?.emit('board-updated', data);
      }
    });

    // Board deleted - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('board-deleted', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('board-deleted', data);
      } else {
        this.io?.emit('board-deleted', data);
      }
    });

    // Board reordered - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('board-reordered', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('board-reordered', data);
      } else {
        this.io?.emit('board-reordered', data);
      }
    });

    // Column updates - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('column-updated', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('column-updated', data);
    });

    // Column created - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('column-created', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('column-created', data);
    });

    // Column deleted - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('column-deleted', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('column-deleted', data);
    });

    // Column reordered - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('column-reordered', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('column-reordered', data);
    });

    // Member updates - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('member-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('member-updated', data);
      } else {
        this.io?.emit('member-updated', data);
      }
    });

    // Activity updates - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('activity-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('activity-updated', data);
      } else {
        this.io?.emit('activity-updated', data);
      }
    });

    // Admin user management events - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('user-created', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('user-created', data);
      } else {
        this.io?.emit('user-created', data);
      }
    });

    redisService.subscribeToAllTenants('user-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('user-updated', data);
      } else {
        this.io?.emit('user-updated', data);
      }
    });

    redisService.subscribeToAllTenants('user-role-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('user-role-updated', data);
      } else {
        this.io?.emit('user-role-updated', data);
      }
    });

    redisService.subscribeToAllTenants('user-deleted', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('user-deleted', data);
      } else {
        this.io?.emit('user-deleted', data);
      }
    });

    // Admin settings events - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('settings-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('settings-updated', data);
      } else {
        this.io?.emit('settings-updated', data);
      }
    });

    // Task watcher updates - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('task-watcher-added', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('task-watcher-added', data);
    });

    redisService.subscribeToAllTenants('task-watcher-removed', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('task-watcher-removed', data);
    });

    // Task collaborator updates - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('task-collaborator-added', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('task-collaborator-added', data);
    });

    redisService.subscribeToAllTenants('task-collaborator-removed', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('task-collaborator-removed', data);
    });

    // Member updates - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('member-created', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('member-created', data);
      } else {
        this.io?.emit('member-created', data);
      }
    });

    redisService.subscribeToAllTenants('member-deleted', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('member-deleted', data);
      } else {
        this.io?.emit('member-deleted', data);
      }
    });

    // Filter events - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('filter-created', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('filter-created', data);
      } else {
        this.io?.emit('filter-created', data);
      }
    });

    redisService.subscribeToAllTenants('filter-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('filter-updated', data);
      } else {
        this.io?.emit('filter-updated', data);
      }
    });

    redisService.subscribeToAllTenants('filter-deleted', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('filter-deleted', data);
      } else {
        this.io?.emit('filter-deleted', data);
      }
    });

    // Comment events - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('comment-created', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('comment-created', data);
    });

    redisService.subscribeToAllTenants('comment-updated', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('comment-updated', data);
    });

    redisService.subscribeToAllTenants('comment-deleted', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('comment-deleted', data);
    });

    // Attachment events - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('attachment-created', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('attachment-created', data);
    });

    redisService.subscribeToAllTenants('attachment-deleted', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('attachment-deleted', data);
    });

    // User profile events - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('user-profile-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('user-profile-updated', data);
      } else {
        this.io?.emit('user-profile-updated', data);
      }
    });

    // Tag management events - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('tag-created', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('tag-created', data);
      } else {
        this.io?.emit('tag-created', data);
      }
    });

    redisService.subscribeToAllTenants('tag-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('tag-updated', data);
      } else {
        this.io?.emit('tag-updated', data);
      }
    });

    redisService.subscribeToAllTenants('tag-deleted', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('tag-deleted', data);
      } else {
        this.io?.emit('tag-deleted', data);
      }
    });

    // Priority management events - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('priority-created', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('priority-created', data);
      } else {
        this.io?.emit('priority-created', data);
      }
    });

    redisService.subscribeToAllTenants('priority-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('priority-updated', data);
      } else {
        this.io?.emit('priority-updated', data);
      }
    });

    redisService.subscribeToAllTenants('priority-deleted', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('priority-deleted', data);
      } else {
        this.io?.emit('priority-deleted', data);
      }
    });

    redisService.subscribeToAllTenants('priority-reordered', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('priority-reordered', data);
      } else {
        this.io?.emit('priority-reordered', data);
      }
    });

    // Sprint management events - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('sprint-created', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('sprint-created', data);
      } else {
        this.io?.emit('sprint-created', data);
      }
    });

    redisService.subscribeToAllTenants('sprint-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('sprint-updated', data);
      } else {
        this.io?.emit('sprint-updated', data);
      }
    });

    redisService.subscribeToAllTenants('sprint-deleted', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('sprint-deleted', data);
      } else {
        this.io?.emit('sprint-deleted', data);
      }
    });

    // Task tag events - broadcast to tenant-specific board room
    redisService.subscribeToAllTenants('task-tag-added', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('task-tag-added', data);
    });

    redisService.subscribeToAllTenants('task-tag-removed', (data, tenantId) => {
      const room = tenantId 
        ? `tenant-${tenantId}-board-${data.boardId}`
        : `board-${data.boardId}`;
      this.io?.to(room).emit('task-tag-removed', data);
    });

    // Instance status updates - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('instance-status-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('instance-status-updated', data);
      } else {
        this.io?.emit('instance-status-updated', data);
      }
    });

    // Version update events - broadcast to tenant-specific clients
    redisService.subscribeToAllTenants('version-updated', (data, tenantId) => {
      if (tenantId) {
        this.io?.to(`tenant-${tenantId}`).emit('version-updated', data);
      } else {
        this.io?.emit('version-updated', data);
      }
    });
  }

  getConnectedClients() {
    return Array.from(this.connectedClients.values());
  }

  getClientCount() {
    return this.connectedClients.size;
  }

  getBoardClientCount(boardId) {
    return Array.from(this.connectedClients.values()).filter(client => client.boardId === boardId).length;
  }

  // Cleanup: Disconnect Redis adapter clients (for graceful shutdown)
  async disconnect() {
    try {
      // Close Socket.IO server
      if (this.io) {
        this.io.close();
        console.log('✅ Socket.IO server closed');
      }

      // Disconnect Redis adapter clients
      if (this.redisPubClient) {
        await this.redisPubClient.disconnect();
        console.log('✅ Socket.IO Redis pub client disconnected');
      }
      
      if (this.redisSubClient) {
        await this.redisSubClient.disconnect();
        console.log('✅ Socket.IO Redis sub client disconnected');
      }

      this.connectedClients.clear();
    } catch (error) {
      console.error('❌ Error disconnecting WebSocket service:', error);
    }
  }
}

export default new WebSocketService();
