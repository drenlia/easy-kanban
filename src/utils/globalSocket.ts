import { io, Socket } from 'socket.io-client';

// Global Socket.IO connection that survives HMR
let globalSocket: Socket | null = null;
let isConnecting = false;

/**
 * Detects if we're in multi-tenant mode.
 * Uses the MULTI_TENANT environment variable injected at build time.
 */
function isMultiTenantMode(): boolean {
  // Use the MULTI_TENANT env var injected at build time via Vite
  // This matches the server-side process.env.MULTI_TENANT
  const multiTenant = (process.env.MULTI_TENANT as string) === 'true';
  return multiTenant;
}

export const initializeSocket = (token: string): Promise<Socket> => {
  return new Promise((resolve, reject) => {
    // If no token provided, reject silently
    if (!token) {
      console.log('🔌 No token provided for global socket');
      reject(new Error('No token provided'));
      return;
    }

    // Check if we're redirecting to login
    if (window.location.hash === '#login') {
      console.log('🔌 Skipping global socket connection - redirecting to login');
      reject(new Error('Redirecting to login'));
      return;
    }

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

    // Determine transport strategy based on deployment mode
    // Multi-tenant: Use websocket only (Redis adapter handles session sharing across pods)
    // Single-tenant: Use polling + websocket (more reliable through proxies, no session issues)
    const isMultiTenant = isMultiTenantMode();
    const transports = isMultiTenant 
      ? ['websocket'] // Multi-tenant: websocket only to avoid session ID issues with load balancing
      : ['polling', 'websocket']; // Single-tenant: polling first, then upgrade to websocket

    console.log(`🔌 Global Socket transport config: ${isMultiTenant ? 'multi-tenant' : 'single-tenant'} mode, using transports: [${transports.join(', ')}]`);

    globalSocket = io(window.location.origin, {
      auth: { token },
      transports,
      timeout: 30000, // Increased timeout to 30 seconds
      reconnection: true, // Enable automatic reconnection
      reconnectionAttempts: 5, // Try up to 5 times
      reconnectionDelay: 1000, // Wait 1 second between attempts
      reconnectionDelayMax: 5000, // Max 5 seconds between attempts
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
      
      // Handle authentication errors - but don't redirect immediately
      // Let the API interceptor handle token validation
      if (error.message === 'Invalid token' || error.message === 'Authentication required') {
        console.log('🔑 Global Socket authentication failed - token may be invalid');
        // Don't clear token here - let API calls determine if token is actually invalid
        reject(new Error('Authentication failed'));
        return;
      }
      
      // For all other errors (network issues, server down, etc.), just reject and continue
      reject(error);
    });

    globalSocket.on('disconnect', (reason) => {
      console.log('🔴 Global Socket.IO disconnected:', reason);
      isConnecting = false;
    });

    globalSocket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Global Socket.IO reconnected after', attemptNumber, 'attempts');
      isConnecting = false;
    });

    globalSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 Global Socket.IO reconnection attempt', attemptNumber);
    });

    globalSocket.on('reconnect_error', (error) => {
      console.error('❌ Global Socket.IO reconnection error:', error.message);
    });

    globalSocket.on('reconnect_failed', () => {
      console.error('❌ Global Socket.IO reconnection failed after all attempts');
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
