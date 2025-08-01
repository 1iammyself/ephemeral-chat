import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load environment variables based on the current mode
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    base: './',
    define: {
      'process.env': env
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          ws: true
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          ws: true
        }
      },
      host: '0.0.0.0',
      hmr: {
        protocol: 'ws',
        host: 'localhost'
      }
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            vendor: ['socket.io-client']
          }
        }
      }
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'socket.io-client']
    }
  };
});
