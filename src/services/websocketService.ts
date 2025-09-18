import { Server } from 'socket.io';
import redisService from './redisService';

class WebSocketService {
  private io: Server | null = null;
  private connectedClients = new Map<string, { socketId: string; boardId?: string }>();

  initialize(server: any) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Handle connections
    this.io.on('connection', (socket) => {
      console.log('🔌 Client connected:', socket.id);
      this.connectedClients.set(socket.id, { socketId: socket.id });

      // Join board room
      socket.on('join-board', (boardId: string) => {
        socket.join(`board-${boardId}`);
        this.connectedClients.set(socket.id, { socketId: socket.id, boardId });
        console.log(`📋 Client ${socket.id} joined board: ${boardId}`);
      });

      // Leave board room
      socket.on('leave-board', (boardId: string) => {
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

  private setupRedisSubscriptions() {
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

    // Board updates
    redisService.subscribe('board-updated', (data) => {
      console.log('📨 Broadcasting board-updated:', data);
      this.io?.to(`board-${data.boardId}`).emit('board-updated', data);
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
  }

  getConnectedClients() {
    return Array.from(this.connectedClients.values());
  }

  getClientCount() {
    return this.connectedClients.size;
  }

  getBoardClientCount(boardId: string) {
    return Array.from(this.connectedClients.values()).filter(client => client.boardId === boardId).length;
  }
}

export default new WebSocketService();
