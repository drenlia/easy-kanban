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
    allowedHosts: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['localhost', '127.0.0.1'],
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
});
