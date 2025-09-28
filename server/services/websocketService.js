import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import redisService from './redisService.js';
import { JWT_SECRET } from '../middleware/auth.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  initialize(server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || true,
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    
    
    // Add authentication middleware
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          return next(new Error('Invalid token'));
        }
        
        // Attach user info to socket
        socket.userId = decoded.id;
        socket.userEmail = decoded.email;
        socket.userRole = decoded.role;
        socket.userRoles = decoded.roles;
        
        next();
      });
    });
    

    // Handle connections
    this.io.on('connection', (socket) => {
      this.connectedClients.set(socket.id, { 
        socketId: socket.id, 
        userId: socket.userId,
        userEmail: socket.userEmail,
        userRole: socket.userRole
      });

      // Join board room
      socket.on('join-board', (boardId) => {
        
        // For now, allow all authenticated users to join any board
        // TODO: Add proper board access control based on user permissions
        socket.join(`board-${boardId}`);
        this.connectedClients.set(socket.id, { 
          socketId: socket.id, 
          userId: socket.userId,
          userEmail: socket.userEmail,
          userRole: socket.userRole,
          boardId 
        });
        
        // Send confirmation back to client
        socket.emit('joined-room', { boardId, room: `board-${boardId}` });
      });

      // Leave board room
      socket.on('leave-board', (boardId) => {
        socket.leave(`board-${boardId}`);
        this.connectedClients.set(socket.id, { 
          socketId: socket.id, 
          userId: socket.userId,
          userEmail: socket.userEmail,
          userRole: socket.userRole
        });
      });

      // Handle user activity
      socket.on('user-activity', (data) => {
        // Broadcast user activity to other clients on the same board
        const client = this.connectedClients.get(socket.id);
        if (client?.boardId) {
          socket.to(`board-${client.boardId}`).emit('user-activity', {
            ...data,
            socketId: socket.id,
            userId: socket.userId,
            userEmail: socket.userEmail
          });
        }
      });

      socket.on('disconnect', () => {
        this.connectedClients.delete(socket.id);
      });
    });

    // Subscribe to Redis channels
    this.setupRedisSubscriptions();
  }

  setupRedisSubscriptions() {
    
    // Task updates
    redisService.subscribe('task-updated', (data) => {
      
      this.io?.to(`board-${data.boardId}`).emit('task-updated', data);
    });

    // Task created
    redisService.subscribe('task-created', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('task-created', data);
    });

    // Task deleted
    redisService.subscribe('task-deleted', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('task-deleted', data);
    });

    // Task relationship created
    redisService.subscribe('task-relationship-created', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('task-relationship-created', data);
    });

    // Task relationship deleted
    redisService.subscribe('task-relationship-deleted', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('task-relationship-deleted', data);
    });

    // Board created
    redisService.subscribe('board-created', (data) => {
      this.io?.emit('board-created', data);
    });

    // Board updates
    redisService.subscribe('board-updated', (data) => {
      this.io?.emit('board-updated', data); // Broadcast to all users since board list affects everyone
    });

    // Board deleted
    redisService.subscribe('board-deleted', (data) => {
      this.io?.emit('board-deleted', data);
    });

    // Board reordered
    redisService.subscribe('board-reordered', (data) => {
      this.io?.emit('board-reordered', data);
    });

    // Column updates
    redisService.subscribe('column-updated', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('column-updated', data);
    });

    // Column created
    redisService.subscribe('column-created', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('column-created', data);
    });

    // Column deleted
    redisService.subscribe('column-deleted', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('column-deleted', data);
    });

    // Column reordered
    redisService.subscribe('column-reordered', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('column-reordered', data);
    });

    // Member updates
    redisService.subscribe('member-updated', (data) => {
      this.io?.emit('member-updated', data);
    });

    // Activity updates
    redisService.subscribe('activity-updated', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('activity-updated', data);
    });

    // Admin user management events
    redisService.subscribe('user-created', (data) => {
      this.io?.emit('user-created', data);
    });

    redisService.subscribe('user-updated', (data) => {
      this.io?.emit('user-updated', data);
    });

    redisService.subscribe('user-role-updated', (data) => {
      this.io?.emit('user-role-updated', data);
    });

    redisService.subscribe('user-deleted', (data) => {
      this.io?.emit('user-deleted', data);
    });

    // Admin settings events
    redisService.subscribe('settings-updated', (data) => {
      this.io?.emit('settings-updated', data);
    });

    // Task watcher updates
    redisService.subscribe('task-watcher-added', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('task-watcher-added', data);
    });

    redisService.subscribe('task-watcher-removed', (data) => {
      this.io?.to(`board-${data.boardId}`).emit('task-watcher-removed', data);
    });

            // Task collaborator updates
            redisService.subscribe('task-collaborator-added', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('task-collaborator-added', data);
            });

            redisService.subscribe('task-collaborator-removed', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('task-collaborator-removed', data);
            });

            // Member updates
            redisService.subscribe('member-created', (data) => {
              this.io?.emit('member-created', data);
            });

            redisService.subscribe('member-deleted', (data) => {
              this.io?.emit('member-deleted', data);
            });

            // Filter events
            redisService.subscribe('filter-created', (data) => {
              this.io?.emit('filter-created', data);
            });

            redisService.subscribe('filter-updated', (data) => {
              this.io?.emit('filter-updated', data);
            });

            redisService.subscribe('filter-deleted', (data) => {
              this.io?.emit('filter-deleted', data);
            });

            // Comment events
            redisService.subscribe('comment-created', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('comment-created', data);
            });

            redisService.subscribe('comment-updated', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('comment-updated', data);
            });

            redisService.subscribe('comment-deleted', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('comment-deleted', data);
            });

            // Attachment events
            redisService.subscribe('attachment-created', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('attachment-created', data);
            });

            redisService.subscribe('attachment-deleted', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('attachment-deleted', data);
            });

            // User profile events
            redisService.subscribe('user-profile-updated', (data) => {
              this.io?.emit('user-profile-updated', data);
            });

            // Tag management events
            redisService.subscribe('tag-created', (data) => {
              this.io?.emit('tag-created', data);
            });

            redisService.subscribe('tag-updated', (data) => {
              this.io?.emit('tag-updated', data);
            });

            redisService.subscribe('tag-deleted', (data) => {
              this.io?.emit('tag-deleted', data);
            });

            // Priority management events
            redisService.subscribe('priority-created', (data) => {
              this.io?.emit('priority-created', data);
            });

            redisService.subscribe('priority-updated', (data) => {
              this.io?.emit('priority-updated', data);
            });

            redisService.subscribe('priority-deleted', (data) => {
              this.io?.emit('priority-deleted', data);
            });

            redisService.subscribe('priority-reordered', (data) => {
              this.io?.emit('priority-reordered', data);
            });

            // Settings update events
            redisService.subscribe('settings-updated', (data) => {
              this.io?.emit('settings-updated', data);
            });

            // Task tag events
            redisService.subscribe('task-tag-added', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('task-tag-added', data);
            });

            redisService.subscribe('task-tag-removed', (data) => {
              this.io?.to(`board-${data.boardId}`).emit('task-tag-removed', data);
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
}

export default new WebSocketService();
