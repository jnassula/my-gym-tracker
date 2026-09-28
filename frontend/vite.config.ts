/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// In Docker the backend is reachable as http://backend:8000; locally it defaults to the
// host port published by docker compose.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8200'

// https://vite.dev/config/
export default defineConfig({
  // The router plugin must run before React: it generates src/routeTree.gen.ts.
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      // Our own service worker (src/sw), so it can also receive push notifications.
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      // A new version waits until the user taps "Atualizar" (src/pwa.ts), never mid-workout.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'myGymTracker',
        short_name: 'myGymTracker',
        description: 'O teu plano em PDF vira um treino guiado.',
        lang: 'pt',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#161826',
        theme_color: '#161826',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      // The worker also runs in `npm run dev`, so push notifications can be tried locally.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
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
