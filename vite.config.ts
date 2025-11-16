import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['lucide-react'],
  },
  define: {
    'process.env.DEMO_ENABLED': JSON.stringify(process.env.DEMO_ENABLED),
  },
  server: {
    host: '0.0.0.0',
    port: 3010,
    hmr: false, // Disable Hot Module Reload to prevent Socket.IO connection loops
    ws: false, // Disable WebSocket completely
    allowedHosts: (() => {
      // Extract hostnames from ALLOWED_ORIGINS (which may contain full URLs)
      const defaultHosts = ['localhost', '127.0.0.1'];
      if (process.env.ALLOWED_ORIGINS) {
        const hosts = new Set(defaultHosts);
        process.env.ALLOWED_ORIGINS.split(',').forEach(origin => {
          // Remove protocol (http:// or https://) and port if present
          const hostname = origin.trim()
            .replace(/^https?:\/\//, '') // Remove protocol
            .replace(/:\d+$/, '') // Remove port
            .split('/')[0]; // Take only the hostname part
          if (hostname && hostname !== 'true' && hostname !== 'false') {
            hosts.add(hostname);
          }
        });
        return Array.from(hosts);
      }
      return defaultHosts;
    })(),
    // CORS headers removed - let Express handle all CORS
    proxy: {
      '/api': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
      },
      '/attachments': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
      },
      '/avatars': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
      },
      '/api/files/attachments': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
      },
      '/api/files/avatars': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
  // Preview server configuration (for production)
  preview: {
    host: '0.0.0.0',
    port: 3010,
    proxy: {
      '/api': {
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
      '/ready': {
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
      '/attachments': {
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
      '/avatars': {
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
      '/api/files/attachments': {
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
      '/api/files/avatars': {
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3222',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
});
