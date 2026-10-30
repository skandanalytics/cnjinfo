import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
let printNetworkBanner = null
try {
  const net = require('./scripts/detect-network.cjs')
  printNetworkBanner = net.printNetworkBanner
} catch (e) {
  // Graceful fallback if module not found
}

function foodieNetworkBannerPlugin() {
  return {
    name: 'foodie-network-banner',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          if (typeof printNetworkBanner === 'function') {
            try {
              printNetworkBanner({ frontendPort: 5173, backendPort: 8000 })
            } catch (err) {
              console.warn('[Foodie] Network banner error:', err.message)
            }
          }
        }, 150)
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    foodieNetworkBannerPlugin()
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        configure: (proxy) => {
          const originalOn = proxy.on.bind(proxy);
          proxy.on = (event, listener) => {
            if (event === 'error') {
              return originalOn('error', (err, req, res) => {
                // Silently handle expected WebSocket disconnect / reset errors
                const isReset = err && (
                  err.code === 'ECONNRESET' ||
                  err.code === 'ECONNREFUSED' ||
                  err.code === 'EPIPE' ||
                  String(err.message || '').includes('ECONNRESET')
                );
                if (isReset) {
                  try {
                    const socket = (res && typeof res.destroy === 'function') ? res : (req && req.socket);
                    if (socket && !socket.destroyed && typeof socket.destroy === 'function') {
                      socket.destroy();
                    }
                  } catch (_) {}
                  return;
                }
                return listener(err, req, res);
              });
            }
            if (event === 'proxyReqWs') {
              return originalOn('proxyReqWs', (proxyReq, req, socket, options) => {
                if (socket && typeof socket.on === 'function') {
                  socket.on('error', (err) => {
                    const isReset = err && (
                      err.code === 'ECONNRESET' ||
                      err.code === 'ECONNREFUSED' ||
                      err.code === 'EPIPE' ||
                      String(err.message || '').includes('ECONNRESET')
                    );
                    if (isReset) {
                      try {
                        if (!socket.destroyed && typeof socket.destroy === 'function') {
                          socket.destroy();
                        }
                      } catch (_) {}
                    }
                  });
                }
                return listener(proxyReq, req, socket, options);
              });
            }
            return originalOn(event, listener);
          };
        },
      },
      '/media': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
