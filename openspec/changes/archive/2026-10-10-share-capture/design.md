# Design

## Context

The client is a PWA (`vite-plugin-pwa`, manifest in `web/vite.config.ts`) with a tiny history router (`web/src/app/router.ts`); the Go server serves `index.html` for every non-API path, so any new client route works without server changes. Tasks are created with `createTask` → `mutate()` (local write plus outbox). CSP is `default-src 'self'`. Constraints: local-first, no secrets outside the app, keyboard-first, keep the image and bundle small.

## Goals / Non-Goals

**Goals:**
- One capture screen reached from the share sheet, a bookmarklet and an extension.
- Works offline and across sign-in; creates ordinary op-log tasks.
- Extension with no token, no network, minimal permissions.

**Non-Goals:**
- File sharing, token-based direct API capture from the extension, store publishing, page scraping.

## Decisions

### D1. GET share target to a client route
`share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } }`. The route is handled by the SPA; the service worker's navigation fallback already serves the precached shell for it (only `/api/` and `/healthz` are excluded).
- Why: GET needs no service worker `fetch` handler for form data, carries everything we accept (no files), and is offline-capable by construction. POST with `multipart/form-data` is required only for files, which are out of scope.
- Note: some platforms put the URL in `text` rather than `url`; the capture screen extracts the last `http(s)` URL from `text` when `url` is empty.

### D2. Capture screen reuses quick add
`ShareCapture` renders the existing `QuickAdd` component for the title (so `nlp-quick-add` chips apply once shipped), a textarea for the description, a project select, Save/Cancel. Save calls `createTask({title, project_id, due?, priority?, ...})` then `updateTask(id, {description})` in one `mutate` where possible; both are local writes queued for sync. After save: `window.close()` when `window.opener` or `history.length <= 1` (popup from bookmarklet/extension), else navigate to the Inbox or the chosen project.

### D3. Signed-out handling
Payload is parsed from the query string into component state before the auth gate renders; the auth screen receives a `returnTo` of `/share` and the payload is kept in memory (module-level variable), never in storage or on the server. Reloading the sign-in page loses the payload; acceptable and documented.

### D4. Bookmarklet
Generated in Settings from `location.origin`: a `javascript:` URL that reads `location.href`, `document.title`, `getSelection().toString()`, URL-encodes them and calls `window.open(origin + '/share?...', 'opentodo-capture', 'popup,width=480,height=640')`. No token, no inline script on our origin (it runs in the visited page), so CSP is untouched. Settings shows it as a draggable link with copy fallback.

### D5. Extension
Manifest V3, plain JavaScript, no bundler: `manifest.json`, `background.js` (action click, context menu, command → read tab url/title, run `getSelection()` via `scripting.executeScript` on the active tab, open the share URL in a popup window), `options.html` (server URL, validated as `http(s)` origin, stored in `storage.sync`). Permissions: `activeTab`, `contextMenus`, `scripting`, `storage`; no host permissions, no `fetch`. Firefox compatibility via `browser_specific_settings` and the `browser.*` promise API through a two-line shim. CI zips `extension/` as a release asset; store publishing is a separate release step.
- Alternative: extension posts directly to `/api/v1/tasks` with a stored token. Rejected: a token in extension storage is a new secret to protect, the capture would fail offline, and it would bypass the local-first path where the user's device is the source of truth.

### D6. Payload hygiene
Title ≤ 500 chars, text ≤ 16 KB (with a "[truncated]" note), URL accepted only if `new URL(u).protocol` is `http:` or `https:`; everything rendered as text nodes, never HTML; the screen never navigates to the URL. No auto-save query parameter.

### D7. Data model, dependencies, footprint
No new fields, no server tables, no op changes; writes go through `mutate()`. No new dependency. Bundle +~2 KB gzipped; extension ~5 KB; container image and server memory unchanged.

## Risks / Trade-offs

- [Share sheet behaviour differs by OS and browser] → GET target is the most widely supported; URL-in-text fallback; documented matrix in `docs/capture.md`.
- [Popup blockers stop the bookmarklet] → `window.open` is called synchronously from the click; fallback message to allow popups for the site.
- [Payload lost if the user reloads during sign-in] → documented; small cost versus storing unsaved third-party content.
- [MV3 API drift between browsers] → minimal API surface; manual test on Chromium and Firefox per release.
- [Users expect file sharing] → out of scope until attachments exist; the manifest advertises only text fields so the app is not offered for files.

## Migration Plan

Purely additive client and repository changes; rollback is redeploying the previous web build. Existing installs pick up the share target on the next manifest update.

## Open Questions

- Whether to add an `enctype` POST share target for files once attachment storage exists.
- Whether the extension should offer a quick "save without confirmation" mode behind an explicit option.
