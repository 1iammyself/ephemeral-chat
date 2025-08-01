import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Load environment variables based on the current mode
  const env = loadEnv(mode, process.cwd(), '');
  
  // Determine base URL based on deployment platform
  const isProd = mode === 'production';
  let baseUrl = '/';
  
  if (isProd) {
    // For Vercel deployment
    if (process.env.VERCEL) {
      baseUrl = 'https://ephemeral-chat-iota.vercel.app';
    } 
    // For Render deployment
    else if (process.env.RENDER) {
      baseUrl = 'https://ephemeral-chat-7j66.onrender.com';
    }
    // Local development or fallback
    else {
      baseUrl = process.env.VITE_BASE_URL || '/';
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'Ephemeral Chat',
          short_name: 'EphChat',
          description: 'Secure, anonymous, and ephemeral chat application',
          theme_color: '#4F46E5',
          background_color: '#1f2937',
          display: 'standalone',
          orientation: 'portrait',
          start_url: baseUrl,
          scope: baseUrl,
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'maskable-icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\./i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false,
          type: 'module',
          navigateFallback: 'index.html',
        },
      })
    ],
    base: baseUrl,
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
