import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

export default defineConfig(({ mode }) => {
  // Load environment variables based on the current mode
  const env = loadEnv(mode, process.cwd(), '');

  // Determine base URL based on environment
  const isProd = mode === 'production';
  let baseUrl = process.env.VITE_BASE_URL || (isProd ? 'https://chat.kyere.me' : '/');

  // For production on Render
  if (isProd && process.env.RENDER) {
    baseUrl = 'https://chat.kyere.me'; // fallback to Render only if Koyeb is down
  }

  return {
    plugins: [
      wasm(),
      react()
    ],
    base: baseUrl,
    define: {
      'process.env': env
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
          ws: true
        },
        '/socket.io': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
          ws: true
        },
        '/upload-audio': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false
        },
        '/audio': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false
        },
        '/games': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false
        }
      },
      host: '0.0.0.0',
      hmr: {
        protocol: 'ws',
        host: '127.0.0.1'
      }
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: isProd ? false : true,
      minify: true,
      rollupOptions: {
        // Capacitor plugins are native-only; externalize so the web build doesn't fail.
        // The attestation-provider uses dynamic imports with try/catch fallbacks,
        // so these will safely resolve to empty modules at web runtime.
        external: [
          '@capacitor/device',
          '@anuradev/capacitor-play-integrity',
          '@capacitor-community/apple-sign-in',
        ],
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('agora-rtc-sdk-ng') || /AgoraRTC/.test(id) || id.includes('agora')) {
                return 'agora';
              }
              if (id.includes('react') || id.includes('react-router-dom')) {
                return 'react-vendor';
              }
              if (id.includes('socket.io-client')) {
                return 'socketio';
              }
              if (id.includes('/yjs/') || id.includes('y-protocols') || id.includes('y-codemirror') || id.includes('yjs')) {
                return 'yjs';
              }
              if (id.includes('@codemirror/') || id.includes('@lezer/') || id.includes('codemirror') || id.includes('@uiw/react-codemirror') || id.includes('@uiw/codemirror-')) {
                return 'codemirror';
              }
              if (id.includes('lucide-react')) {
                return 'lucide';
              }
              if (id.includes('tweetnacl') || id.includes('libsodium') || id.includes('openmls') || id.includes('mlkem') || id.includes('hpke') || id.includes('@noble/')) {
                return 'crypto-libs';
              }
              if (id.includes('emoji-picker-react')) {
                return 'emoji-picker';
              }
              if (id.includes('i18next') || id.includes('react-i18next')) {
                return 'i18n';
              }
              if (id.includes('lamejs')) {
                return 'audio-libs';
              }
              // fallback vendor chunk for other node_modules
              return 'vendor';
            }
            // Split heavy local modules out of the main chunk
            if (id.includes('/src/crypto/')) return 'app-crypto';
            if (id.includes('/src/utils/aesEncryption') || id.includes('/src/utils/security')) return 'app-e2ee';
            if (id.includes('/src/i18n/')) return 'app-i18n';
          }
        }
      },
      chunkSizeWarningLimit: 1500
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'socket.io-client'],
      exclude: ['openmls-wasm']
    }
  };
});
