import { io, Socket } from 'socket.io-client';

class WebSocketClient {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private readyCallbacks: (() => void)[] = [];
  private eventCallbacks: Map<string, Function[]> = new Map();
  private pendingBoardJoin: string | null = null; // Store board to join when ready

  connect() {
    if (this.socket?.connected) {
      return;
    }

    // Get authentication token
    const token = localStorage.getItem('authToken');
    if (!token) {
      return;
    }

    // Check if we're in the middle of redirecting due to invalid token
    if (window.location.hash === '#login') {
      return;
    }

    // Validate token before connecting - make a test API call
    this.validateTokenAndConnect(token);
  }

  private async validateTokenAndConnect(token: string) {
    try {
      // Make a simple API call to validate the token
      const response = await fetch('/api/user/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return;
      }

      this.establishConnection(token);
    } catch (error) {
    }
  }

  private establishConnection(token: string) {
    // Disconnect any existing socket to ensure fresh connection with new token
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Use the same URL as the frontend - the frontend will proxy WebSocket connections to the backend
    const serverUrl = window.location.origin;

    this.socket = io(serverUrl, {
      auth: { token }, // Add authentication token
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
      
      // Re-register all event listeners
      this.reregisterEventListeners();
      
      // Add a general event listener to debug all events
      this.socket.onAny((eventName, ...args) => {
      });
      
      // Trigger ready callbacks directly
      this.readyCallbacks.forEach((callback, index) => {
        callback();
      });
      
      // Handle pending board join
      if (this.pendingBoardJoin) {
        this.joinBoard(this.pendingBoardJoin);
        this.pendingBoardJoin = null;
      }
      
      // Trigger custom connect callbacks
      const connectCallbacks = this.eventCallbacks.get('connect') || [];
      connectCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Error in connect callback:', error);
        }
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      
      // Trigger custom disconnect callbacks
      const disconnectCallbacks = this.eventCallbacks.get('disconnect') || [];
      disconnectCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Error in disconnect callback:', error);
        }
      });
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      this.isConnected = false;
      
      // Handle authentication errors - redirect to login for expired/invalid tokens
      if (error.message === 'Invalid token' || error.message === 'Authentication required') {
        console.log('🔑 WebSocket auth error - token expired or invalid');
        // Clear token and redirect to login
        localStorage.removeItem('authToken');
        window.location.replace(window.location.origin + '/#login');
        return;
      }
      
      // For all other errors (network issues, server down, etc.), just log and continue
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
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  joinBoard(boardId: string) {
    if (this.socket?.connected) {
      this.socket.emit('join-board', boardId);
      
      // Add debugging to see if we're actually in the room
      this.socket.on('joined-room', (data) => {
      });
    } else {
    }
  }

  // Method to join board when WebSocket becomes ready
  joinBoardWhenReady(boardId: string) {
    if (this.socket?.connected) {
      this.joinBoard(boardId);
    } else {
      // Store the boardId to join when ready
      this.pendingBoardJoin = boardId;
    }
  }

  leaveBoard(boardId: string) {
    if (this.socket?.connected) {
      this.socket.emit('leave-board', boardId);
    }
  }

  // Re-register all stored event listeners
  private reregisterEventListeners() {
    this.eventCallbacks.forEach((callbacks, eventName) => {
      callbacks.forEach(callback => {
        this.socket?.on(eventName, callback);
      });
    });
    
    // Add debugging for task-updated events specifically
    this.socket?.on('task-updated', (data) => {
    });
  }

  // Helper method to store and register event listeners
  private addEventListener(eventName: string, callback: Function) {
    // Store the callback
    if (!this.eventCallbacks.has(eventName)) {
      this.eventCallbacks.set(eventName, []);
    }
    this.eventCallbacks.get(eventName)!.push(callback);
    
    // Register with socket if connected
    if (this.socket?.connected) {
      this.socket.on(eventName, callback);
      if (eventName === 'task-updated') {
      }
    }
  }

  // Event listeners
  onTaskCreated(callback: (data: any) => void) {
    this.addEventListener('task-created', callback);
  }

  onTaskUpdated(callback: (data: any) => void) {
    this.addEventListener('task-updated', callback);
  }

  onTaskDeleted(callback: (data: any) => void) {
    this.addEventListener('task-deleted', callback);
  }

  onTaskRelationshipCreated(callback: (data: any) => void) {
    this.addEventListener('task-relationship-created', callback);
  }

  onTaskRelationshipDeleted(callback: (data: any) => void) {
    this.addEventListener('task-relationship-deleted', callback);
  }

  onColumnCreated(callback: (data: any) => void) {
    this.addEventListener('column-created', callback);
  }

  onColumnUpdated(callback: (data: any) => void) {
    this.addEventListener('column-updated', callback);
  }

  onColumnDeleted(callback: (data: any) => void) {
    this.addEventListener('column-deleted', callback);
  }

  onColumnReordered(callback: (data: any) => void) {
    this.addEventListener('column-reordered', callback);
  }

  onBoardCreated(callback: (data: any) => void) {
    this.addEventListener('board-created', callback);
  }

  onBoardUpdated(callback: (data: any) => void) {
    this.addEventListener('board-updated', callback);
  }

  onBoardDeleted(callback: (data: any) => void) {
    this.addEventListener('board-deleted', callback);
  }

  onBoardReordered(callback: (data: any) => void) {
    this.addEventListener('board-reordered', callback);
  }

  onTaskWatcherAdded(callback: (data: any) => void) {
    this.addEventListener('task-watcher-added', callback);
  }

  onTaskWatcherRemoved(callback: (data: any) => void) {
    this.addEventListener('task-watcher-removed', callback);
  }

  onTaskCollaboratorAdded(callback: (data: any) => void) {
    this.addEventListener('task-collaborator-added', callback);
  }

  onTaskCollaboratorRemoved(callback: (data: any) => void) {
    this.addEventListener('task-collaborator-removed', callback);
  }

  onMemberUpdated(callback: (data: any) => void) {
    this.addEventListener('member-updated', callback);
  }

  onActivityUpdated(callback: (data: any) => void) {
    this.addEventListener('activity-updated', callback);
  }

  onMemberCreated(callback: (data: any) => void) {
    this.addEventListener('member-created', callback);
  }

  onMemberDeleted(callback: (data: any) => void) {
    this.addEventListener('member-deleted', callback);
  }

  onUserActivity(callback: (data: any) => void) {
    this.addEventListener('user-activity', callback);
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

  // Instance status events
  onInstanceStatusUpdated(callback: (data: any) => void) {
    this.addEventListener('instance-status-updated', callback);
  }

  offInstanceStatusUpdated(callback?: (data: any) => void) {
    this.socket?.off('instance-status-updated', callback);
  }

  // Version update events
  onVersionUpdated(callback: (data: any) => void) {
    this.addEventListener('version-updated', callback);
  }

  offVersionUpdated(callback?: (data: any) => void) {
    this.socket?.off('version-updated', callback);
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

  // Force reconnect with new token
  reconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.connect();
  }

  // Filter events
  onFilterCreated(callback: (data: any) => void) {
    this.addEventListener('filter-created', callback);
  }

  offFilterCreated(callback?: (data: any) => void) {
    this.socket?.off('filter-created', callback);
  }

  onFilterUpdated(callback: (data: any) => void) {
    this.addEventListener('filter-updated', callback);
  }

  offFilterUpdated(callback?: (data: any) => void) {
    this.socket?.off('filter-updated', callback);
  }

  onFilterDeleted(callback: (data: any) => void) {
    this.addEventListener('filter-deleted', callback);
  }

  offFilterDeleted(callback?: (data: any) => void) {
    this.socket?.off('filter-deleted', callback);
  }

  // Comment events
  onCommentCreated(callback: (data: any) => void) {
    this.addEventListener('comment-created', callback);
  }

  offCommentCreated(callback?: (data: any) => void) {
    this.socket?.off('comment-created', callback);
  }

  onCommentUpdated(callback: (data: any) => void) {
    this.addEventListener('comment-updated', callback);
  }

  offCommentUpdated(callback?: (data: any) => void) {
    this.socket?.off('comment-updated', callback);
  }

  onCommentDeleted(callback: (data: any) => void) {
    this.addEventListener('comment-deleted', callback);
  }

  offCommentDeleted(callback?: (data: any) => void) {
    this.socket?.off('comment-deleted', callback);
  }

  // Attachment events
  onAttachmentCreated(callback: (data: any) => void) {
    this.addEventListener('attachment-created', callback);
  }

  offAttachmentCreated(callback?: (data: any) => void) {
    this.socket?.off('attachment-created', callback);
  }

  onAttachmentDeleted(callback: (data: any) => void) {
    this.addEventListener('attachment-deleted', callback);
  }

  offAttachmentDeleted(callback?: (data: any) => void) {
    this.socket?.off('attachment-deleted', callback);
  }

  // User profile events
  onUserProfileUpdated(callback: (data: any) => void) {
    this.addEventListener('user-profile-updated', callback);
  }

  offUserProfileUpdated(callback?: (data: any) => void) {
    this.socket?.off('user-profile-updated', callback);
  }

  // Tag management events
  onTagCreated(callback: (data: any) => void) {
    this.addEventListener('tag-created', callback);
  }

  offTagCreated(callback?: (data: any) => void) {
    this.socket?.off('tag-created', callback);
  }

  onTagUpdated(callback: (data: any) => void) {
    this.addEventListener('tag-updated', callback);
  }

  offTagUpdated(callback?: (data: any) => void) {
    this.socket?.off('tag-updated', callback);
  }

  onTagDeleted(callback: (data: any) => void) {
    this.addEventListener('tag-deleted', callback);
  }

  offTagDeleted(callback?: (data: any) => void) {
    this.socket?.off('tag-deleted', callback);
  }

  // Priority management events
  onPriorityCreated(callback: (data: any) => void) {
    this.addEventListener('priority-created', callback);
  }

  offPriorityCreated(callback?: (data: any) => void) {
    this.socket?.off('priority-created', callback);
  }

  onPriorityUpdated(callback: (data: any) => void) {
    this.addEventListener('priority-updated', callback);
  }

  offPriorityUpdated(callback?: (data: any) => void) {
    this.socket?.off('priority-updated', callback);
  }

  onPriorityDeleted(callback: (data: any) => void) {
    this.addEventListener('priority-deleted', callback);
  }

  offPriorityDeleted(callback?: (data: any) => void) {
    this.socket?.off('priority-deleted', callback);
  }

  onPriorityReordered(callback: (data: any) => void) {
    this.addEventListener('priority-reordered', callback);
  }

  offPriorityReordered(callback?: (data: any) => void) {
    this.socket?.off('priority-reordered', callback);
  }

  // Settings update events
  onSettingsUpdated(callback: (data: any) => void) {
    this.addEventListener('settings-updated', callback);
  }

  offSettingsUpdated(callback?: (data: any) => void) {
    this.socket?.off('settings-updated', callback);
  }

  // Task snapshots update events
  onTaskSnapshotsUpdated(callback: (data: any) => void) {
    this.addEventListener('task-snapshots-updated', callback);
  }

  offTaskSnapshotsUpdated(callback?: (data: any) => void) {
    this.socket?.off('task-snapshots-updated', callback);
  }

  // User management events
  onUserCreated(callback: (data: any) => void) {
    this.addEventListener('user-created', callback);
  }

  offUserCreated(callback?: (data: any) => void) {
    this.socket?.off('user-created', callback);
  }

  onUserUpdated(callback: (data: any) => void) {
    this.addEventListener('user-updated', callback);
  }

  offUserUpdated(callback?: (data: any) => void) {
    this.socket?.off('user-updated', callback);
  }

  onUserRoleUpdated(callback: (data: any) => void) {
    this.addEventListener('user-role-updated', callback);
  }

  offUserRoleUpdated(callback?: (data: any) => void) {
    this.socket?.off('user-role-updated', callback);
  }

  onUserDeleted(callback: (data: any) => void) {
    this.addEventListener('user-deleted', callback);
  }

  offUserDeleted(callback?: (data: any) => void) {
    this.socket?.off('user-deleted', callback);
  }

  // Task tag events
  onTaskTagAdded(callback: (data: any) => void) {
    this.addEventListener('task-tag-added', callback);
  }

  offTaskTagAdded(callback?: (data: any) => void) {
    this.socket?.off('task-tag-added', callback);
  }

  onTaskTagRemoved(callback: (data: any) => void) {
    this.addEventListener('task-tag-removed', callback);
  }

  offTaskTagRemoved(callback?: (data: any) => void) {
    this.socket?.off('task-tag-removed', callback);
  }

  // Connection status methods
  getIsConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  // Subscribe to connect event
  onConnect(callback: () => void) {
    if (!this.eventCallbacks.has('connect')) {
      this.eventCallbacks.set('connect', []);
    }
    this.eventCallbacks.get('connect')!.push(callback);
    
    if (this.socket) {
      this.socket.on('connect', callback);
    }
  }

  offConnect(callback: () => void) {
    const callbacks = this.eventCallbacks.get('connect') || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
    
    if (this.socket) {
      this.socket.off('connect', callback);
    }
  }

  // Subscribe to disconnect event
  onDisconnect(callback: () => void) {
    if (!this.eventCallbacks.has('disconnect')) {
      this.eventCallbacks.set('disconnect', []);
    }
    this.eventCallbacks.get('disconnect')!.push(callback);
    
    if (this.socket) {
      this.socket.on('disconnect', callback);
    }
  }

  offDisconnect(callback: () => void) {
    const callbacks = this.eventCallbacks.get('disconnect') || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
    
    if (this.socket) {
      this.socket.off('disconnect', callback);
    }
  }
}

export default new WebSocketClient();
