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
    port: '3010',
    hmr: false, // Disable Hot Module Reload to prevent Socket.IO connection loops
    ws: false, // Disable WebSocket completely
    allowedHosts: process.env.VITE_ALLOWED_HOSTS ? process.env.VITE_ALLOWED_HOSTS.split(',') : ['localhost', '127.0.0.1'],
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    },
    proxy: {
      '/api': {
        target: 'http://0.0.0.0:3222',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
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
