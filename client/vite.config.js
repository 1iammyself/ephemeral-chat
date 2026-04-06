import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

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
      topLevelAwait(),
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'Ephemeral Chat',
          short_name: 'EphChat',
          description: 'Secure, Private, and ephemeral chat application',
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
      sourcemap: isProd ? false : true, // Disable sourcemaps in prod for security
      minify: 'esbuild',
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
          // Use a function to place very large deps in their own chunks.
          // This helps keep the main chunk smaller and allows browsers to cache
          // large vendor files separately.
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
              // fallback vendor chunk for other node_modules
              return 'vendor';
            }
          }
        }
      },
      // Raise the warning limit slightly so large but split bundles don't spam warnings.
      // Still keep it reasonably low to encourage further splitting if necessary.
      chunkSizeWarningLimit: 700
    },
    esbuild: {
      drop: isProd ? ['console', 'debugger'] : []
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'socket.io-client'],
      exclude: ['openmls-wasm']
    }
  };
});
