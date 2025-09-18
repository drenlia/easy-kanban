import { Server as SocketIOServer } from 'socket.io';
import redisService from './redisService.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  initialize(server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    console.log('🔌 WebSocket service initialized');

    // Handle connections
    this.io.on('connection', (socket) => {
      console.log('🔌 Client connected:', socket.id);
      this.connectedClients.set(socket.id, { socketId: socket.id });

      // Join board room
      socket.on('join-board', (boardId) => {
        console.log(`📋 Received join-board event for board: ${boardId} from client: ${socket.id}`);
        socket.join(`board-${boardId}`);
        this.connectedClients.set(socket.id, { socketId: socket.id, boardId });
        console.log(`📋 Client ${socket.id} joined board: ${boardId}`);
        console.log(`📋 Total clients in board ${boardId}:`, this.getBoardClientCount(boardId));
      });

      // Leave board room
      socket.on('leave-board', (boardId) => {
        socket.leave(`board-${boardId}`);
        this.connectedClients.set(socket.id, { socketId: socket.id });
        console.log(`📋 Client ${socket.id} left board: ${boardId}`);
      });

      // Handle user activity
      socket.on('user-activity', (data) => {
        // Broadcast user activity to other clients on the same board
        const client = this.connectedClients.get(socket.id);
        if (client?.boardId) {
          socket.to(`board-${client.boardId}`).emit('user-activity', {
            ...data,
            socketId: socket.id
          });
        }
      });

      socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        this.connectedClients.delete(socket.id);
      });
    });

    // Subscribe to Redis channels
    this.setupRedisSubscriptions();
  }

  setupRedisSubscriptions() {
    // Task updates
    redisService.subscribe('task-updated', (data) => {
      console.log('📨 Broadcasting task-updated:', data);
      this.io?.to(`board-${data.boardId}`).emit('task-updated', data);
    });

    // Task created
    redisService.subscribe('task-created', (data) => {
      console.log('📨 Broadcasting task-created:', data);
      this.io?.to(`board-${data.boardId}`).emit('task-created', data);
    });

    // Task deleted
    redisService.subscribe('task-deleted', (data) => {
      console.log('📨 Broadcasting task-deleted:', data);
      this.io?.to(`board-${data.boardId}`).emit('task-deleted', data);
    });

    // Task relationship created
    redisService.subscribe('task-relationship-created', (data) => {
      console.log('📨 Broadcasting task-relationship-created:', data);
      this.io?.to(`board-${data.boardId}`).emit('task-relationship-created', data);
    });

    // Task relationship deleted
    redisService.subscribe('task-relationship-deleted', (data) => {
      console.log('📨 Broadcasting task-relationship-deleted:', data);
      this.io?.to(`board-${data.boardId}`).emit('task-relationship-deleted', data);
    });

    // Board created
    redisService.subscribe('board-created', (data) => {
      console.log('📨 Broadcasting board-created:', data);
      this.io?.emit('board-created', data);
    });

    // Board updates
    redisService.subscribe('board-updated', (data) => {
      console.log('📨 Broadcasting board-updated:', data);
      this.io?.to(`board-${data.boardId}`).emit('board-updated', data);
    });

    // Board deleted
    redisService.subscribe('board-deleted', (data) => {
      console.log('📨 Broadcasting board-deleted:', data);
      this.io?.emit('board-deleted', data);
    });

    // Board reordered
    redisService.subscribe('board-reordered', (data) => {
      console.log('📨 Broadcasting board-reordered:', data);
      this.io?.emit('board-reordered', data);
    });

    // Column updates
    redisService.subscribe('column-updated', (data) => {
      console.log('📨 Broadcasting column-updated:', data);
      this.io?.to(`board-${data.boardId}`).emit('column-updated', data);
    });

    // Column created
    redisService.subscribe('column-created', (data) => {
      console.log('📨 Broadcasting column-created:', data);
      this.io?.to(`board-${data.boardId}`).emit('column-created', data);
    });

    // Column deleted
    redisService.subscribe('column-deleted', (data) => {
      console.log('📨 Broadcasting column-deleted:', data);
      this.io?.to(`board-${data.boardId}`).emit('column-deleted', data);
    });

    // Column reordered
    redisService.subscribe('column-reordered', (data) => {
      console.log('📨 Broadcasting column-reordered:', data);
      this.io?.to(`board-${data.boardId}`).emit('column-reordered', data);
    });

    // Member updates
    redisService.subscribe('member-updated', (data) => {
      console.log('📨 Broadcasting member-updated:', data);
      this.io?.emit('member-updated', data);
    });

    // Activity updates
    redisService.subscribe('activity-updated', (data) => {
      console.log('📨 Broadcasting activity-updated:', data);
      this.io?.to(`board-${data.boardId}`).emit('activity-updated', data);
    });

    // Admin user management events
    redisService.subscribe('user-created', (data) => {
      console.log('📨 Broadcasting user-created:', data);
      this.io?.emit('user-created', data);
    });

    redisService.subscribe('user-updated', (data) => {
      console.log('📨 Broadcasting user-updated:', data);
      this.io?.emit('user-updated', data);
    });

    redisService.subscribe('user-role-updated', (data) => {
      console.log('📨 Broadcasting user-role-updated:', data);
      this.io?.emit('user-role-updated', data);
    });

    redisService.subscribe('user-deleted', (data) => {
      console.log('📨 Broadcasting user-deleted:', data);
      this.io?.emit('user-deleted', data);
    });

    // Admin settings events
    redisService.subscribe('settings-updated', (data) => {
      console.log('📨 Broadcasting settings-updated:', data);
      this.io?.emit('settings-updated', data);
    });

    // Task watcher updates
    redisService.subscribe('task-watcher-added', (data) => {
      console.log('📨 Broadcasting task-watcher-added:', data);
      this.io?.to(`board-${data.boardId}`).emit('task-watcher-added', data);
    });

    redisService.subscribe('task-watcher-removed', (data) => {
      console.log('📨 Broadcasting task-watcher-removed:', data);
      this.io?.to(`board-${data.boardId}`).emit('task-watcher-removed', data);
    });

            // Task collaborator updates
            redisService.subscribe('task-collaborator-added', (data) => {
              console.log('📨 Broadcasting task-collaborator-added:', data);
              this.io?.to(`board-${data.boardId}`).emit('task-collaborator-added', data);
            });

            redisService.subscribe('task-collaborator-removed', (data) => {
              console.log('📨 Broadcasting task-collaborator-removed:', data);
              this.io?.to(`board-${data.boardId}`).emit('task-collaborator-removed', data);
            });

            // Member updates
            redisService.subscribe('member-created', (data) => {
              console.log('📨 Broadcasting member-created:', data);
              this.io?.emit('member-created', data);
            });

            redisService.subscribe('member-deleted', (data) => {
              console.log('📨 Broadcasting member-deleted:', data);
              this.io?.emit('member-deleted', data);
            });

            // Filter events
            redisService.subscribe('filter-created', (data) => {
              console.log('📨 Broadcasting filter-created:', data);
              this.io?.emit('filter-created', data);
            });

            redisService.subscribe('filter-updated', (data) => {
              console.log('📨 Broadcasting filter-updated:', data);
              this.io?.emit('filter-updated', data);
            });

            redisService.subscribe('filter-deleted', (data) => {
              console.log('📨 Broadcasting filter-deleted:', data);
              this.io?.emit('filter-deleted', data);
            });

            // Comment events
            redisService.subscribe('comment-created', (data) => {
              console.log('📨 Broadcasting comment-created:', data);
              this.io?.to(`board-${data.boardId}`).emit('comment-created', data);
            });

            redisService.subscribe('comment-updated', (data) => {
              console.log('📨 Broadcasting comment-updated:', data);
              this.io?.to(`board-${data.boardId}`).emit('comment-updated', data);
            });

            redisService.subscribe('comment-deleted', (data) => {
              console.log('📨 Broadcasting comment-deleted:', data);
              this.io?.to(`board-${data.boardId}`).emit('comment-deleted', data);
            });

            // Attachment events
            redisService.subscribe('attachment-created', (data) => {
              console.log('📨 Broadcasting attachment-created:', data);
              this.io?.to(`board-${data.boardId}`).emit('attachment-created', data);
            });

            redisService.subscribe('attachment-deleted', (data) => {
              console.log('📨 Broadcasting attachment-deleted:', data);
              this.io?.to(`board-${data.boardId}`).emit('attachment-deleted', data);
            });

            // User profile events
            redisService.subscribe('user-profile-updated', (data) => {
              console.log('📨 Broadcasting user-profile-updated:', data);
              this.io?.emit('user-profile-updated', data);
            });

            // Tag management events
            redisService.subscribe('tag-created', (data) => {
              console.log('📨 Broadcasting tag-created:', data);
              this.io?.emit('tag-created', data);
            });

            redisService.subscribe('tag-updated', (data) => {
              console.log('📨 Broadcasting tag-updated:', data);
              this.io?.emit('tag-updated', data);
            });

            redisService.subscribe('tag-deleted', (data) => {
              console.log('📨 Broadcasting tag-deleted:', data);
              this.io?.emit('tag-deleted', data);
            });

            // Priority management events
            redisService.subscribe('priority-created', (data) => {
              console.log('📨 Broadcasting priority-created:', data);
              this.io?.emit('priority-created', data);
            });

            redisService.subscribe('priority-updated', (data) => {
              console.log('📨 Broadcasting priority-updated:', data);
              this.io?.emit('priority-updated', data);
            });

            redisService.subscribe('priority-deleted', (data) => {
              console.log('📨 Broadcasting priority-deleted:', data);
              this.io?.emit('priority-deleted', data);
            });

            redisService.subscribe('priority-reordered', (data) => {
              console.log('📨 Broadcasting priority-reordered:', data);
              this.io?.emit('priority-reordered', data);
            });

            // Settings update events
            redisService.subscribe('settings-updated', (data) => {
              console.log('📨 Broadcasting settings-updated:', data);
              this.io?.emit('settings-updated', data);
            });

            // Task tag events
            redisService.subscribe('task-tag-added', (data) => {
              console.log('📨 Broadcasting task-tag-added:', data);
              this.io?.to(`board-${data.boardId}`).emit('task-tag-added', data);
            });

            redisService.subscribe('task-tag-removed', (data) => {
              console.log('📨 Broadcasting task-tag-removed:', data);
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
