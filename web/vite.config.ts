/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The production bundle is written into the Go module so it can be embedded in
// the single binary (see internal/web/web.go).
/**
 * The task page (task-pages D8) is not the app: no web app manifest and no service
 * worker registration in t.html, so a guest's browser never installs or precaches
 * the app. The PWA plugin adds both to every page; this takes them out of that one.
 */
function taskPageWithoutPwa(): Plugin {
  return {
    name: 'opentodo-task-page-without-pwa',
    enforce: 'post',
    // After everything is written: the PWA plugin adds its tags late in the build.
    writeBundle(options) {
      const file = path.join(options.dir ?? '', 't.html')
      if (!fs.existsSync(file)) return
      const html = fs.readFileSync(file, 'utf8')
        .replace(/<link rel="manifest"[^>]*>/g, '')
        .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '')
      fs.writeFileSync(file, html)
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    taskPageWithoutPwa(),
    tailwindcss(),
    VitePWA({
      // Our own worker (OpenSpec attachments D9): Workbox precaching plus the
      // share sheet's POST with files, which a generated worker cannot handle.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
        // OpenSpec share-capture and attachments D9: the installed app is offered in
        // the system share sheet, files included. The service worker (src/sw.ts)
        // answers the POST offline and hands the files to /share through IndexedDB.
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title', text: 'text', url: 'url',
            files: [{ name: 'files', accept: ['image/*', 'application/pdf', 'text/*', 'audio/*', 'video/*', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip'] }],
          },
        },
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Precache only the built assets. The worker has deliberately no runtime
        // caching: nothing under /api/ (in particular the live event stream
        // /api/v1/sync/events) may ever be served from or stored in a cache.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The map (task-locations D5) is not precached: it needs the network for
        // its tiles anyway, and a device with maps off should never download it.
        globIgnores: ['**/MapView-*', '**/maplibre-gl-worker-*', 't.html', '**/assets/t-*'],
        // A classic worker, so importScripts('push-sw.js') keeps working.
        rollupFormat: 'iife',
      },
    }),
  ],
  build: {
    outDir: '../internal/web/dist',
    // Kept false so internal/web/dist/.gitkeep survives; `npm run build` removes the
    // previous hashed assets first, so old bundles never pile up in the embed.
    emptyOutDir: false,
    sourcemap: false,
    // Dynamic imports: the optional Vim layer (vim-keybindings), the note document
    // code lib/richtext (Yjs) and the notes editor (ProseMirror), both
    // collaborative-rich-text. All are precached by the service worker, so the
    // preload helper would only add bytes to the main chunk; skip it.
    modulePreload: false,
    rollupOptions: {
      // The task page (task-pages D8) is its own small document: no app shell, no
      // local database, no editor. The server serves t.html for /t/<secret>.
      input: { main: 'index.html', t: 't.html' },
    },
  },
  server: {
    port: 5173,
    // changeOrigin stays false: the API's cross-site check compares Origin with Host,
    // and the browser's Origin is this dev server (localhost:5173).
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: false },
      '/healthz': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    // Interaction tests seed IndexedDB and render whole screens; with every core
    // busy (parallel workers) a few take seconds. Conditions are awaited with
    // waitFor (ui/test-utils, 10 s), so the cap only has to catch a hang
    // (web-lint-and-test-hygiene).
    testTimeout: 30_000,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    // Token tests read index.css as text (src/ui/tokens); other CSS stays stubbed.
    css: { include: [/index\.css/] },
  },
})
