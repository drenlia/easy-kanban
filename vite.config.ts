import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  define: {
    'process.env.DEMO_ENABLED': JSON.stringify(process.env.DEMO_ENABLED),
  },
  server: {
    host: '0.0.0.0',
    port: '3010',
    hmr: false, // Disable Hot Module Reload to prevent Socket.IO connection loops
    proxy: {
      '/api': {
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
      '/socket.io': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
});
