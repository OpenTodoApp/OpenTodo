/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The production bundle is written into the Go module so it can be embedded in
// the single binary (see internal/web/web.go).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'OpenTodo',
        short_name: 'OpenTodo',
        description: 'Your tasks, your server. Open-source, local-first task manager.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // OpenSpec share-capture: the installed app is offered in the system share
        // sheet. GET keeps it offline-capable: /share is an SPA route served by the
        // precached shell, so no service-worker fetch handler is needed (files are
        // out of scope, which is the only reason to use POST).
        share_target: {
          action: '/share',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the built assets. There is deliberately no runtimeCaching:
        // nothing under /api/ (in particular the live event stream
        // /api/v1/sync/events) may ever be served from or stored in a cache, and the
        // SPA navigation fallback must not swallow API or health URLs either.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//, /^\/healthz/],
        cleanupOutdatedCaches: true,
        // Reminder push, notification actions and the shown set (OpenSpec `reminders`).
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  build: {
    outDir: '../internal/web/dist',
    emptyOutDir: false,
    sourcemap: false,
    // Dynamic imports: the optional Vim layer (vim-keybindings), the note document
    // code lib/richtext (Yjs) and the notes editor (ProseMirror), both
    // collaborative-rich-text. All are precached by the service worker, so the
    // preload helper would only add bytes to the main chunk; skip it.
    modulePreload: false,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080', '/healthz': 'http://localhost:8080' },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
