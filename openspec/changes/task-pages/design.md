## Context

Public links (`public-links`) already solve most of the hard parts for a project: hashed secrets, use-time checks, `noindex`/`no-referrer`, per-link and per-address limits, guest writes through `ApplyStrict` with a reserved `public:` device, and attribution in history and activity. They serve plaintext from the server's materialised state, which is why `end-to-end-encryption` forbids publishing an unshared project of an encrypted account. Comments are ops in the task's scope with a server-set author (`comments`). Notifications go through `internal/notify` sinks; new kinds use optional sink interfaces. The location data and the map tile proxy come from the parallel change `task-locations`.

## Goals / Non-Goals

**Goals:**
- One task, one page, one link that works for an encrypted account without the server ever reading the task or holding a key that opens it.
- Guest replies and ticks travel the same op paths as every other write, so they converge offline and show up in history, activity and notifications.
- Reuse the public-links machinery (limits, headers, use-time checks, attribution style) instead of a parallel stack.

**Non-Goals:**
- Real-time push to the guest (the page polls every 30 seconds, like the public page).
- Guests editing anything but replies and completion.
- Encrypting file attachments for encrypted pages (link attachments only in this version).

## Decisions

**D1. Live for readable tasks, snapshot only for encrypted ones.** A task whose scope the server can read (any task of an unencrypted account, any task in a shared project) is served live from materialised state. Only a task in an encrypted personal scope uses the device-made snapshot. Live keeps the page current with no work on the publisher's devices, needs no re-upload, works when all the publisher's devices are off, and reuses the public-links read path (one query for the task, one for its subtasks, one for comments since `published_at`). Using snapshots for everyone would make plaintext pages go stale whenever the publisher's devices are offline, for no privacy gain since the server already reads that data. The mode is derived per request from the task's scope, so a move between scopes switches mode without a migration (see the lifecycle requirement).

**D2. Secret first, label second.** The URL is `/t/<secret>[/<label>]`: 22 characters of base64url (128 bits) from `internal/ids`, stored as a SHA-256 hash like public link secrets. The label is ignored for lookup, so a guessable slug never becomes a key and renaming the label never breaks a link. Alternative considered: a custom slug as the address with a PIN; rejected because a slug is guessable and a PIN is one more thing to forward.

**D3. Share key, never the account key.** The device generates a 256-bit AES-GCM key with WebCrypto (the primitives in `web/src/lib/crypto.ts`), encrypts the page snapshot (a JSON document with exactly the fields of the live response) and wraps the share key with the account key so every unlocked device of the publisher can re-upload and import replies. The fragment `#<base64url key>` is never sent by browsers; the page script reads it, decrypts in memory and clears nothing it did not store. Revoking deletes ciphertext and wrapped key; a leaked link exposes only that one task's snapshot.

**D4. Encrypted replies are pending server rows, imported by the publisher's devices.** A guest cannot write an op that the publisher's devices could decrypt with the account key, and the server cannot convert it. So the server keeps `{reply_id, ciphertext}` rows; an unlocked device decrypts with the share key and writes an ordinary comment op encrypted with the account key, from its own device, with `guest_name` and `page_id`. The comment id is a name-based UUID of the reply id (`internal/ids` / web twin), so two devices importing at once write identical ops that converge. Ticks need no content and are written by the server directly in both modes.

**D5. Guest writes are authored by the publisher, marked by the device.** As for public links, ops written for a guest carry the publisher as actor (the server-set author rule stays intact) and device `page:<page-id>`; the sync route refuses `page:` from devices. History, activity and the comment thread resolve "<name> (guest, task page)" from `guest_name`/`page_id` and the device prefix at read time.

**D6. Data model.**
- Migration `NNNN_task_pages.sql`: `task_pages` (`id`, `task_id`, `user_id`, `secret_hash`, `rights`, `label`, `include_map`, `expires_at`, `published_at`, `revoked_at`, `last_opened_at`, `snapshot` BLOB NULL, `snapshot_version` INTEGER, `wrapped_key` BLOB NULL) with a unique index on active pages per task, and `task_page_replies` (`id`, `page_id`, `ciphertext`, `created_at`). Server-side data, not ops; in backups, not in the user export (like public links).
- Op schema, additive: comment fields `guest_name` (string, content: added to `internal/e2ee.ContentFields` and `CONTENT_FIELDS`) and `page_id` (id). Added to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`. No field renamed.

**D7. Routes and policies.** Signed in: `POST|GET|DELETE /api/v1/tasks/{id}/page` and `PUT .../page/snapshot`, `GET .../page/replies`, `DELETE .../page/replies/{replyId}`, registered with `signedIn.fullTokens()`, publish with `.recent()`, all `.demoDenied()` and listed in `internal/httpapi/demo.go`. Public: `GET /api/v1/pages/{secret}`, `POST .../replies`, `POST .../tick` with `public("task pages, OpenSpec task-pages")` and `.demoDenied()`, sharing the public-links limiter with separate budgets; the page shell at `/t/` is a static, separately built entry.

**D8. A small page bundle.** `/t/` gets its own Vite entry (no app shell, no Dexie, no ProseMirror): the Markdown renderer already used for comments, the crypto helpers, the map component only when a location is served (lazy chunk from `task-locations`). Target under 40 KB gzipped for the page without a map. The binary grows by the bundle plus the Go handlers (estimated under 150 KB); no new dependency; runtime memory unchanged apart from snapshots read per request (at most 256 KB each).

**D9. Notifications through an optional sink.** A `notify.PageSink` interface (`GuestReplied`, `GuestCompleted`) implemented by the in-app inbox and push; for encrypted tasks the event carries only the task id, and the client fills in the title after decrypting.

**D10. Interface budget.** Nothing is added above a list. In the task panel the "Published" marker sits in the existing header row next to the title actions (no new row of chrome) and the menu gains one item; no new task property is shown by default; no sidebar destination; no new scroll region (the dialog scrolls inside the existing overlay); no new shortcut, so the registry is unchanged. The `/t/` page is a separate document with one scroll region.

## Risks / Trade-offs

- [The link is the key; a forwarded link gives access] → Expiry, one-click revoke and republish, a notice on the page and in the dialog, `lastOpenedAt` in the status.
- [Encrypted pages go stale while all the publisher's devices are offline] → The page shows "Updated <time>"; replies wait as pending rows and are never lost; ticks still apply.
- [A guest name can impersonate anyone] → Always shown with "(guest)" and the task-page mark; members are never shown as guests.
- [Guest spam] → 20 replies per hour per page, per-address limits, no images or HTML in replies, revoke deletes pending replies.
- [Map tiles reveal the viewed area to the server] → Documented; "Show the map" is a publish option, off-able per page.
- [A comment written before publishing becoming public] → Only comments created after `published_at` are served; the composer says new comments are visible.

## Migration Plan

One additive migration creates the two tables; older servers ignore the new comment fields (additive op schema). Rolling back the binary leaves the tables unused and pages unreachable; guest comments stay as ordinary comments with extra fields that older clients ignore.

## Notes from implementation

- **Page bundle (D8) is over the 40 KB target.** The page's own code is 4.3 KB gzipped (`t-*.js`) plus 0.5 KB of share-key crypto, but it is a React page and shares a chunk with the app (React DOM, the Markdown renderer, dates and i18n), about 97 KB gzipped in all on a first visit. Meeting 40 KB would need a page without React, which would also mean a second Markdown renderer and a second map wrapper; recorded instead of done. The page is never precached and never registers the service worker (the build removes the PWA tags from `t.html`), and the map chunk loads only when a location is shown.
- **A list route for the publisher's devices.** Devices need to know which of their tasks have encrypted pages and the wrapped share keys, so `GET /api/v1/task-pages` lists the caller's own active pages (spec updated). The status route still never returns a key.
- **Guest names in history.** Ticks carry no content, so the name a guest typed is kept server-side per write in `task_page_actions` (page id and op timestamp) and history and activity label the change "<name> (guest, task page)". On an encrypted page the name is content and is not kept: ticks read "Guest (task page)". The device-side activity label comes from `guest_name` on replies and from the server's label otherwise.
- **The page's map and files.** Guests have no session, so the page has its own routes for files (always a download) and for the map proxy (style rewritten to point at the page's routes, a separate per-page budget for tiles).
- **Push.** The server has no push channel for notifications today (push is for reminders), so page events reach the in-app inbox only; the sink is ready for a push implementation.
- **The guest's name** is stored under a hash of the secret, never the secret itself. The language follows the browser and is not stored.

## Open Questions

- Whether a member who is the task's assignee (not owner or admin) should also receive the guest notifications; deferrable, it does not change the routes or the data model.
