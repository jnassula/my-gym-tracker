/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// In Docker the backend is reachable as http://backend:8000; locally it defaults to the
// host port published by docker compose.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8200'

// https://vite.dev/config/
export default defineConfig({
  // The router plugin must run before React: it generates src/routeTree.gen.ts.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // File events don't reliably cross the Docker bind mount on macOS: poll inside the container.
    watch: process.env.VITE_WATCH_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    // Same-origin proxy: the refresh-token cookie stays first-party (SameSite=Lax) and no CORS.
    proxy: {
      // xfwd: forward the client IP (X-Forwarded-For) for the backend's rate limits.
      '/api': { target: apiTarget, changeOrigin: true, xfwd: true },
      '/health': { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
