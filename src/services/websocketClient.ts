import { io, Socket } from 'socket.io-client';

class WebSocketClient {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private readyCallbacks: (() => void)[] = [];

  connect() {
    if (this.socket?.connected) {
      return;
    }

    // Use the same URL as the frontend - the frontend will proxy WebSocket connections to the backend
    const serverUrl = window.location.origin;

    this.socket = io(serverUrl, {
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      forceNew: true, // Force a new connection
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000; // Reset delay
      
      // Trigger ready callbacks directly
      this.readyCallbacks.forEach(callback => {
        callback();
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      this.isConnected = false;
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ WebSocket reconnection error:', error);
      this.reconnectAttempts++;
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ WebSocket reconnection failed after', this.maxReconnectAttempts, 'attempts');
      this.isConnected = false;
    });
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  joinBoard(boardId: string) {
    if (this.socket?.connected) {
      this.socket.emit('join-board', boardId);
    }
  }

  leaveBoard(boardId: string) {
    if (this.socket?.connected) {
      this.socket.emit('leave-board', boardId);
    }
  }

  // Event listeners
  onTaskCreated(callback: (data: any) => void) {
    this.socket?.on('task-created', callback);
  }

  onTaskUpdated(callback: (data: any) => void) {
    this.socket?.on('task-updated', callback);
  }

  onTaskDeleted(callback: (data: any) => void) {
    this.socket?.on('task-deleted', callback);
  }

  onTaskRelationshipCreated(callback: (data: any) => void) {
    this.socket?.on('task-relationship-created', callback);
  }

  onTaskRelationshipDeleted(callback: (data: any) => void) {
    this.socket?.on('task-relationship-deleted', callback);
  }

  onColumnCreated(callback: (data: any) => void) {
    this.socket?.on('column-created', callback);
  }

  onColumnUpdated(callback: (data: any) => void) {
    this.socket?.on('column-updated', callback);
  }

  onColumnDeleted(callback: (data: any) => void) {
    this.socket?.on('column-deleted', callback);
  }

  onColumnReordered(callback: (data: any) => void) {
    this.socket?.on('column-reordered', callback);
  }

  onBoardCreated(callback: (data: any) => void) {
    this.socket?.on('board-created', callback);
  }

  onBoardUpdated(callback: (data: any) => void) {
    this.socket?.on('board-updated', callback);
  }

  onBoardDeleted(callback: (data: any) => void) {
    this.socket?.on('board-deleted', callback);
  }

  onBoardReordered(callback: (data: any) => void) {
    this.socket?.on('board-reordered', callback);
  }

  onTaskWatcherAdded(callback: (data: any) => void) {
    this.socket?.on('task-watcher-added', callback);
  }

  onTaskWatcherRemoved(callback: (data: any) => void) {
    this.socket?.on('task-watcher-removed', callback);
  }

  onTaskCollaboratorAdded(callback: (data: any) => void) {
    this.socket?.on('task-collaborator-added', callback);
  }

  onTaskCollaboratorRemoved(callback: (data: any) => void) {
    this.socket?.on('task-collaborator-removed', callback);
  }

  onMemberUpdated(callback: (data: any) => void) {
    this.socket?.on('member-updated', callback);
  }

  onActivityUpdated(callback: (data: any) => void) {
    this.socket?.on('activity-updated', callback);
  }

  onMemberCreated(callback: (data: any) => void) {
    this.socket?.on('member-created', callback);
  }

  onMemberDeleted(callback: (data: any) => void) {
    this.socket?.on('member-deleted', callback);
  }

  onUserActivity(callback: (data: any) => void) {
    this.socket?.on('user-activity', callback);
  }

  onWebSocketReady(callback: () => void) {
    this.readyCallbacks.push(callback);
    
    // If already connected, call immediately
    if (this.isConnected) {
      callback();
    }
  }

  // Send user activity
  sendUserActivity(data: any) {
    if (this.socket?.connected) {
      this.socket.emit('user-activity', data);
    }
  }

  // Remove event listeners
  offTaskCreated(callback?: (data: any) => void) {
    this.socket?.off('task-created', callback);
  }

  offTaskUpdated(callback?: (data: any) => void) {
    this.socket?.off('task-updated', callback);
  }

  offTaskDeleted(callback?: (data: any) => void) {
    this.socket?.off('task-deleted', callback);
  }

  offTaskRelationshipCreated(callback?: (data: any) => void) {
    this.socket?.off('task-relationship-created', callback);
  }

  offTaskRelationshipDeleted(callback?: (data: any) => void) {
    this.socket?.off('task-relationship-deleted', callback);
  }

  offColumnCreated(callback?: (data: any) => void) {
    this.socket?.off('column-created', callback);
  }

  offColumnUpdated(callback?: (data: any) => void) {
    this.socket?.off('column-updated', callback);
  }

  offColumnDeleted(callback?: (data: any) => void) {
    this.socket?.off('column-deleted', callback);
  }

  offColumnReordered(callback?: (data: any) => void) {
    this.socket?.off('column-reordered', callback);
  }

  offBoardCreated(callback?: (data: any) => void) {
    this.socket?.off('board-created', callback);
  }

  offBoardUpdated(callback?: (data: any) => void) {
    this.socket?.off('board-updated', callback);
  }

  offBoardDeleted(callback?: (data: any) => void) {
    this.socket?.off('board-deleted', callback);
  }

  offBoardReordered(callback?: (data: any) => void) {
    this.socket?.off('board-reordered', callback);
  }

  offTaskWatcherAdded(callback?: (data: any) => void) {
    this.socket?.off('task-watcher-added', callback);
  }

  offTaskWatcherRemoved(callback?: (data: any) => void) {
    this.socket?.off('task-watcher-removed', callback);
  }

  offTaskCollaboratorAdded(callback?: (data: any) => void) {
    this.socket?.off('task-collaborator-added', callback);
  }

  offTaskCollaboratorRemoved(callback?: (data: any) => void) {
    this.socket?.off('task-collaborator-removed', callback);
  }

  offMemberUpdated(callback?: (data: any) => void) {
    this.socket?.off('member-updated', callback);
  }

  offActivityUpdated(callback?: (data: any) => void) {
    this.socket?.off('activity-updated', callback);
  }

  offMemberCreated(callback?: (data: any) => void) {
    this.socket?.off('member-created', callback);
  }

  offMemberDeleted(callback?: (data: any) => void) {
    this.socket?.off('member-deleted', callback);
  }

  offUserActivity(callback?: (data: any) => void) {
    this.socket?.off('user-activity', callback);
  }

  offWebSocketReady(callback?: () => void) {
    if (callback) {
      const index = this.readyCallbacks.indexOf(callback);
      if (index > -1) {
        this.readyCallbacks.splice(index, 1);
      }
    } else {
      this.readyCallbacks = [];
    }
  }

  // Utility methods
  isWebSocketConnected() {
    return this.isConnected && this.socket?.connected;
  }

  getSocketId() {
    return this.socket?.id;
  }

  // Filter events
  onFilterCreated(callback: (data: any) => void) {
    this.socket?.on('filter-created', callback);
  }

  offFilterCreated(callback?: (data: any) => void) {
    this.socket?.off('filter-created', callback);
  }

  onFilterUpdated(callback: (data: any) => void) {
    this.socket?.on('filter-updated', callback);
  }

  offFilterUpdated(callback?: (data: any) => void) {
    this.socket?.off('filter-updated', callback);
  }

  onFilterDeleted(callback: (data: any) => void) {
    this.socket?.on('filter-deleted', callback);
  }

  offFilterDeleted(callback?: (data: any) => void) {
    this.socket?.off('filter-deleted', callback);
  }

  // Comment events
  onCommentCreated(callback: (data: any) => void) {
    this.socket?.on('comment-created', callback);
  }

  offCommentCreated(callback?: (data: any) => void) {
    this.socket?.off('comment-created', callback);
  }

  onCommentUpdated(callback: (data: any) => void) {
    this.socket?.on('comment-updated', callback);
  }

  offCommentUpdated(callback?: (data: any) => void) {
    this.socket?.off('comment-updated', callback);
  }

  onCommentDeleted(callback: (data: any) => void) {
    this.socket?.on('comment-deleted', callback);
  }

  offCommentDeleted(callback?: (data: any) => void) {
    this.socket?.off('comment-deleted', callback);
  }

  // Attachment events
  onAttachmentCreated(callback: (data: any) => void) {
    this.socket?.on('attachment-created', callback);
  }

  offAttachmentCreated(callback?: (data: any) => void) {
    this.socket?.off('attachment-created', callback);
  }

  onAttachmentDeleted(callback: (data: any) => void) {
    this.socket?.on('attachment-deleted', callback);
  }

  offAttachmentDeleted(callback?: (data: any) => void) {
    this.socket?.off('attachment-deleted', callback);
  }

  // User profile events
  onUserProfileUpdated(callback: (data: any) => void) {
    this.socket?.on('user-profile-updated', callback);
  }

  offUserProfileUpdated(callback?: (data: any) => void) {
    this.socket?.off('user-profile-updated', callback);
  }

  // Tag management events
  onTagCreated(callback: (data: any) => void) {
    this.socket?.on('tag-created', callback);
  }

  offTagCreated(callback?: (data: any) => void) {
    this.socket?.off('tag-created', callback);
  }

  onTagUpdated(callback: (data: any) => void) {
    this.socket?.on('tag-updated', callback);
  }

  offTagUpdated(callback?: (data: any) => void) {
    this.socket?.off('tag-updated', callback);
  }

  onTagDeleted(callback: (data: any) => void) {
    this.socket?.on('tag-deleted', callback);
  }

  offTagDeleted(callback?: (data: any) => void) {
    this.socket?.off('tag-deleted', callback);
  }

  // Priority management events
  onPriorityCreated(callback: (data: any) => void) {
    this.socket?.on('priority-created', callback);
  }

  offPriorityCreated(callback?: (data: any) => void) {
    this.socket?.off('priority-created', callback);
  }

  onPriorityUpdated(callback: (data: any) => void) {
    this.socket?.on('priority-updated', callback);
  }

  offPriorityUpdated(callback?: (data: any) => void) {
    this.socket?.off('priority-updated', callback);
  }

  onPriorityDeleted(callback: (data: any) => void) {
    this.socket?.on('priority-deleted', callback);
  }

  offPriorityDeleted(callback?: (data: any) => void) {
    this.socket?.off('priority-deleted', callback);
  }

  onPriorityReordered(callback: (data: any) => void) {
    this.socket?.on('priority-reordered', callback);
  }

  offPriorityReordered(callback?: (data: any) => void) {
    this.socket?.off('priority-reordered', callback);
  }

  // Settings update events
  onSettingsUpdated(callback: (data: any) => void) {
    this.socket?.on('settings-updated', callback);
  }

  offSettingsUpdated(callback?: (data: any) => void) {
    this.socket?.off('settings-updated', callback);
  }

  // User management events
  onUserCreated(callback: (data: any) => void) {
    this.socket?.on('user-created', callback);
  }

  offUserCreated(callback?: (data: any) => void) {
    this.socket?.off('user-created', callback);
  }

  onUserUpdated(callback: (data: any) => void) {
    this.socket?.on('user-updated', callback);
  }

  offUserUpdated(callback?: (data: any) => void) {
    this.socket?.off('user-updated', callback);
  }

  onUserRoleUpdated(callback: (data: any) => void) {
    this.socket?.on('user-role-updated', callback);
  }

  offUserRoleUpdated(callback?: (data: any) => void) {
    this.socket?.off('user-role-updated', callback);
  }

  onUserDeleted(callback: (data: any) => void) {
    this.socket?.on('user-deleted', callback);
  }

  offUserDeleted(callback?: (data: any) => void) {
    this.socket?.off('user-deleted', callback);
  }

  // Task tag events
  onTaskTagAdded(callback: (data: any) => void) {
    this.socket?.on('task-tag-added', callback);
  }

  offTaskTagAdded(callback?: (data: any) => void) {
    this.socket?.off('task-tag-added', callback);
  }

  onTaskTagRemoved(callback: (data: any) => void) {
    this.socket?.on('task-tag-removed', callback);
  }

  offTaskTagRemoved(callback?: (data: any) => void) {
    this.socket?.off('task-tag-removed', callback);
  }
}

export default new WebSocketClient();
