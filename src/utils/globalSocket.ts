import { io, Socket } from 'socket.io-client';

// Global Socket.IO connection that survives HMR
let globalSocket: Socket | null = null;
let isConnecting = false;

export const initializeSocket = (token: string): Promise<Socket> => {
  return new Promise((resolve, reject) => {
    // If already connected, return existing socket
    if (globalSocket && globalSocket.connected) {
      console.log('🔌 Using existing Socket.IO connection');
      return resolve(globalSocket);
    }

    // If already connecting, wait for it
    if (isConnecting) {
      console.log('🔌 Connection already in progress...');
      const checkInterval = setInterval(() => {
        if (globalSocket && globalSocket.connected) {
          clearInterval(checkInterval);
          resolve(globalSocket);
        } else if (!isConnecting) {
          clearInterval(checkInterval);
          reject(new Error('Connection failed'));
        }
      }, 100);
      return;
    }

    isConnecting = true;

    // Clean up any existing disconnected socket
    if (globalSocket) {
      globalSocket.removeAllListeners();
      globalSocket.disconnect();
    }

    console.log('🔌 Creating new Socket.IO connection to:', window.location.origin);

    globalSocket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: false, // We'll handle reconnection manually
      autoConnect: true
    });

    globalSocket.on('connect', () => {
      console.log('✅ Global Socket.IO connected:', globalSocket!.id);
      isConnecting = false;
      resolve(globalSocket!);
    });

    globalSocket.on('connect_error', (error) => {
      console.error('❌ Global Socket.IO connection error:', error);
      isConnecting = false;
      reject(error);
    });

    globalSocket.on('disconnect', (reason) => {
      console.log('🔴 Global Socket.IO disconnected:', reason);
      isConnecting = false;
    });
  });
};

export const getSocket = (): Socket | null => {
  return globalSocket;
};

export const disconnectSocket = (): void => {
  if (globalSocket) {
    console.log('🧹 Disconnecting global Socket.IO');
    globalSocket.removeAllListeners();
    globalSocket.disconnect();
    globalSocket = null;
  }
  isConnecting = false;
};

export const isSocketConnected = (): boolean => {
  return globalSocket?.connected ?? false;
};

export const joinBoard = (boardId: string): void => {
  if (globalSocket?.connected) {
    console.log('📋 Joining board:', boardId);
    globalSocket.emit('join-board', boardId);
  }
};

export const leaveBoard = (boardId: string): void => {
  if (globalSocket?.connected) {
    console.log('📋 Leaving board:', boardId);
    globalSocket.emit('leave-board', boardId);
  }
};

// Event subscription helpers
export const onSocketEvent = (event: string, handler: Function): void => {
  if (globalSocket) {
    globalSocket.on(event, handler);
  }
};

export const offSocketEvent = (event: string, handler?: Function): void => {
  if (globalSocket) {
    if (handler) {
      globalSocket.off(event, handler);
    } else {
      globalSocket.off(event);
    }
  }
};
