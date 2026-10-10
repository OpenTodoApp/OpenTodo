# Proposal

## Why

Many tasks start as "deal with this page later": an article, a ticket, a product, a message thread. Capturing that today means copying the URL, switching to OpenTodo, pasting it and typing a title. Phones solve this with the system share sheet and desktops with a toolbar button or bookmarklet, and users expect a task manager to be a target for both. Because the client is local-first, the capture can be entirely a client feature: the shared URL, title and selection land in the device's local store through the normal quick-add path, work offline, and sync like any other task. No server change and no new secret is needed.

## What Changes

- The PWA manifest declares a Web Share Target, so the installed app appears in the mobile and desktop share sheet. Sharing opens a capture screen at `/share` prefilled with the shared title, text and URL.
- A capture screen (`/share`) that shows the proposed title in a quick-add field (so natural-language parsing from `nlp-quick-add` applies once shipped), the selection and URL as the description, and a project picker; Enter saves to the chosen project (Inbox by default), Escape cancels. It works offline because the app shell is precached, and it preserves the payload across sign-in when the device is signed out.
- A bookmarklet generated in Settings for the user's own server origin that opens the capture screen in a small popup with the current page's URL, title and selected text.
- A minimal browser extension (Manifest V3, plain JavaScript, in `extension/`) with a toolbar button, a context-menu entry and a keyboard shortcut that open the same capture screen for the current tab. It stores only the server URL, holds no token and makes no network requests of its own.
- Payload hygiene: only `http(s)` URLs are kept, title and text are treated as plain text and capped in length, and nothing is saved without the user confirming on the capture screen.

Out of scope: sharing files or images (needs attachment storage), capturing directly through the REST API from the extension with a token (avoided so the extension holds no secret and the capture stays offline-capable), publishing the extension to browser stores (packaging and store listings are a release task), native mobile apps, Android intent filters beyond what the PWA share target provides, and reading page content beyond title, URL and selection.

This change advances ROADMAP.md section 2, "Browser extension and mobile share-sheet target" (`share-capture`).

No server changes, no new environment variables, no op log changes; nothing is **BREAKING**.

## Capabilities

### New Capabilities
- `share-capture`: share-target registration, the capture screen and its offline and sign-in behaviour, the bookmarklet, the browser extension, and the safety limits on shared payloads.

### Modified Capabilities
- none

## Impact

- Client: `share_target` entry in the manifest (`web/vite.config.ts`), new `/share` route and `ShareCapture` view, bookmarklet generator in Settings. Bundle impact about 2 KB gzipped; no new dependency. Service worker configuration unchanged (`/share` is an app route served by the precached shell).
- Repository: `extension/` with `manifest.json`, a background service worker, a popup-free action handler and a tiny options page (about 5 KB, no build step); CI zips it as a release asset. Not part of the container image; image size and server memory unaffected.
- Server: none. The SPA fallback already serves `/share`; CSP is unchanged because the capture screen runs on the app's origin.
- Docs: `docs/capture.md` (share sheet, bookmarklet, extension install), README feature list.
