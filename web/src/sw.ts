/// <reference lib="webworker" />
// The app's service worker (OpenSpec change attachments, design D9): Workbox
// precaching and the navigation fallback, as the generated worker had, the
// reminder push handling (push-sw.js), and one route of its own: the share
// sheet's POST /share with files, handed to the page through IndexedDB.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { entryFromForm, putInboxEntry } from './lib/shareInbox'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }

// Reminder push, notification actions and the shown set (OpenSpec `reminders`).
importScripts('push-sw.js')

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Nothing under /api/ (in particular the live event stream) or /healthz is ever
// answered by the app shell or stored in a cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//, /^\/healthz/] }))

registerRoute(
  ({ url, request }) => url.pathname === '/share' && request.method === 'POST',
  async ({ request }) => {
    const form = await request.formData()
    const id = crypto.randomUUID()
    await putInboxEntry(entryFromForm(form, id))
    return Response.redirect(`/share?inbox=${encodeURIComponent(id)}`, 303)
  },
  'POST',
)
