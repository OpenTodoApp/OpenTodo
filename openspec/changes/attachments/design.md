# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Every entity is field-level ops in one scope.** `internal/sync/scope.go:290-310` places `task` and `section` by their project, `comment` by its task through `resolveComment` (`internal/sync/comments.go:124-212`: author equals submitter, immutable `task_id`/`author_id`, `deleted_at` for author, admins and owner), and everything else in the author's personal scope. Values are capped at 64 KB (`docs/sync.md` Limits), so bytes cannot ride on ops.
- **The server already writes fields as device `server`:** REST ops (`internal/httpapi/server.go:120`) and the push scheduler's `reminder.delivered_at` (`internal/push/service.go:418-431`). Only `agent:` and `caldav:` are reserved on `/api/v1/sync` (`server.go:959-968`), so a device could today submit an op with device `server`.
- **The data directory** holds `opentodo.db`, `push_vapid.pem`, `secrets/`, `backups/` and `tmp/` (`internal/backup/service.go:82`, `docs/backups.md`). Backups are `tar → gzip → OTBK1` streams with a manifest listing each file's size and SHA-256 (`internal/backup/archive.go:33-50`); extras are read whole into memory on restore (`restore.go:283-316`, `maxExtraFileSize`), which cannot work for gigabytes of files.
- **Uploads stream nowhere yet.** The import route buffers up to `OPENTODO_IMPORT_MAX_MB` (`internal/httpapi/import.go:33`); every other body is `MaxBytesReader` of a few MB.
- **Security headers:** `securityHeaders` (`server.go:445-456`) sets `nosniff` on everything and the app CSP on non-`/api/` paths only; `img-src 'self' data: blob:` is what thumbnails and decrypted previews must fit.
- **Share target** is a `GET` because the Workbox `generateSW` worker has no fetch handler (`web/vite.config.ts:26-34`); files need a `POST` and therefore a handler.
- **E2EE** encrypts listed string fields at the single exit point `prepareOutgoing` (`web/src/lib/e2eeSync.ts:93`), with the personal-scope test `personalResolver` (`e2eeSync.ts:56-80`) and AES-256-GCM under the account key (`web/src/lib/crypto.ts`). Nothing streams; `MAX_PLAINTEXT_BYTES` is 48,000.
- **Purge** removes ops, scope fields and inserts markers; `Purgeable` is tasks and projects, cascading to sections, comments and reminders (`internal/sync/trash.go:25-26, 181-192`). The retention job runs at startup and daily in one process (`trash.go:291-325`).
- **Importers** warn and drop `attachments` (`internal/importer/profile_json.go:222`, `profile_csv.go:49`); the own-export profile reads `comments` only to count them (`profile_opentodo.go:38, 91`).
- **Assistants** build `get_task` from `sync.List`/`TaskComments` (`internal/agenttools/read.go:363-405`); the same payload serves `opentodo://tasks/{id}` (`resources.go:60`).
- **Demo** refuses by path prefix before authentication (`internal/httpapi/demo.go:118-150`).

## Goals / Non-Goals

**Goals:**
- Attachments that behave like every other piece of data: created offline, synced through ops, converging, exported, backed up, purged with their task.
- Bytes handled once, streaming, with a hard per-file limit and an account quota, on a Raspberry Pi.
- Serving user files from the app's origin without turning the server into a hosting platform for scripts.
- Encrypted accounts keep their guarantee: the server never sees a name or a byte of content.

**Non-Goals:**
- Deduplication across attachments (two uploads of the same file are two files).
- Resumable uploads (files are bounded; a retry restarts).
- Thumbnails generated on the server (the browser scales the real image; no image library).
- Moving files to object storage (one volume is the product principle; backups to S3/WebDAV already cover off-site copies).

## Decisions

### D1. Metadata is a new entity `attachment` in its task's scope

`Schema["attachment"]` in `internal/sync/ops.go`:

| field | kind | written by | notes |
| --- | --- | --- | --- |
| `task_id` | `kID` | creator | immutable; decides the scope |
| `comment_id` | `kNullableString` | creator | immutable; must be a comment of the same task by the same author |
| `name` | `kString` | author | 1–255 characters, no path separators; content field |
| `mime` | `kString` | creator | immutable; content field; `application/octet-stream` when unknown |
| `size` | `kNumber` | creator | immutable; stored byte count (ciphertext size for encrypted files); 0 for links |
| `sha256` | `kString` | creator | immutable; hex digest of the stored bytes; `""` for links |
| `url` | `kNullableString` | creator | immutable; `http`/`https` only; content field; non-null means link attachment |
| `encrypted` | `kBool` | creator | immutable; the bytes are the D8 envelope |
| `author_id` | `kID` | creator | equals the submitting account |
| `created_at` | `kNumber` | creator | immutable |
| `uploaded_at` | `kNullableNumber` | server only | set when the file is stored (D3) |
| `deleted_at` | `kNullableNumber` | author, admin, owner | removal tombstone |

The resolver gets a `case "attachment": return r.resolveAttachment(op)` beside `comment` in `scope.go`, implemented in a new `internal/sync/attachments.go` on the pattern of `comments.go`: a batch note of the winning `task_id`, `comment_id` and `author_id`, an existing-row lookup across the personal and project scopes, the authorship table above, a `too_large` rejection when `size` exceeds the per-file limit at creation (the resolver receives the limit through a `Service` option so the check is one place for sync and REST), and `reasonDiscard` for a purged task. `uploaded_at` is accepted only when `op.Device == "server"` (D3). Validation (`Validate`) adds the `url` scheme check and the `name` rules.

Materialised reads come for free: `sync.List(ctx, uid, "attachment", …)` and `Get` work on any schema entity, and `Purgeable` gains `"attachment"` with a cascade from tasks (D13). The entity is not added to `opsync.Plural`; its REST surface is D4.

- **Alternative: an `attachments` list field on `task` and on `comment`.** Rejected. A list value is replaced whole (like `labels`, `docs/sync.md` "Task labels"), so two devices adding files offline lose one; per-attachment authorship and the server-written `uploaded_at` need per-row fields; and comment attachments would need the same list on a second entity.
- **Alternative: a server-side table outside the op log.** Rejected. Attachments must appear offline on the device that added them and reach other devices through the one sync path; the project rule is that data writes are ops.

**Data model impact:** one new entity, additive. No existing field changes. Dexie gets the next free version with `attachments: 'id, task_id, comment_id'` and `attachmentBlobs: 'id'` (every store redeclared). Entity maps: `lib/ops.ts` (table, defaults), `lib/e2eeSync.ts` (`tableOf`, and `personalResolver` follows `task_id` like a comment), `lib/assistant.ts`, `lib/trash.ts` (`removeLocally` also drops `attachmentBlobs`), `docs/sync.md`. `name`, `mime`, `url` go into `e2ee.ContentFields["attachment"]` and `CONTENT_FIELDS.attachment`. `internal/activity` and `lib/activity.ts` derive nothing from it; an `attachment` op is added to `activity_fixture.json` to pin that. Export: `handleExport` adds an `attachments` array beside `comments` and `user_prefs`.

### D2. Bytes are immutable files under `<data>/attachments/`

New package `internal/blobs`: `Store{dir}` with `Path(id)` = `<data>/attachments/<id[:2]>/<id>` (ids are validated against `^[A-Za-z0-9-]{1,64}$` before any path is built; `ids.New()` on the server, `crypto.randomUUID()` on devices), `Write(ctx, id, r io.Reader, want Spec) error` (stream into `<data>/tmp/upload-<id>-<rand>` through `io.TeeReader` into `sha256`, counting bytes with a `LimitReader` of `max+1`; compare count and digest with the metadata; `fsync`; rename into place; remove the temp file on any error), `Open(id) (*os.File, os.FileInfo, error)`, `Remove(id)`, `Walk(fn)` for backups, the export and the sweep. Files are mode 0600 in 0700 directories, owned by the server user (uid 65532 in the image), like `secrets/`.

Memory: `io.Copy` buffers of 32 KB per transfer plus the hash state. Nothing reads a file whole. A file is written exactly once and never modified, which is what makes `immutable` caching (D6), digest validation and the backup consistency argument (D11) hold.

- **Alternative: SQLite BLOBs.** Rejected. `VACUUM INTO` would copy every file on each backup snapshot, the database (and its WAL during writes) would grow by gigabytes, SQLite's 1 GB blob limit and page cache make large files awkward, and the Trash purge's `DELETE` would not return space without a vacuum.
- **Alternative: content-addressed storage (by digest) with deduplication.** Rejected for now: it needs reference counting across scopes and makes "whose quota" ambiguous. The digest is still stored, so a later change can dedupe.

### D3. Two-step creation from devices; `uploaded_at` is the server's word

A device creates the metadata through `mutate()` (so it exists offline and syncs in the ordinary batch) and keeps the bytes in `attachmentBlobs` (`{id, blob, name, size}`; IndexedDB stores `Blob`s without reading them into JavaScript memory). `lib/attachments.ts` runs an uploader after each successful sync round when the outbox is empty: it takes pending rows oldest first, skips any whose row is tombstoned or still has outbox ops, and `PUT`s the blob to `/api/v1/attachments/{id}/content` with `XMLHttpRequest` (for upload progress; `fetch` has none) and `Content-Length`, one at a time. On 404 (the server has no row yet) it waits for the next sync; on 413/403/429 it keeps the blob and shows the reason; on 204 it deletes the local blob (or keeps it when a per-device "keep files offline" option is on; not in this change).

The server, after `blobs.Write` succeeds, writes `attachment.uploaded_at = now` with `ApplyStrict` as the author and device `server`, then `NotifyApplied`, so every device learns availability through the same sync they use for everything. `resolveAttachment` accepts `uploaded_at` only when `op.Device == "server"`, and `/api/v1/sync` adds `server` to `ReservedDevice` (a device never had that id: `getDeviceId()` is a UUID). The same reservation incidentally closes the forgeability of `reminder.delivered_at`.

Why metadata first: a row that exists before its bytes shows other devices "uploading" (honest, and the file name is already useful), the row's `size` and `sha256` let the server verify the bytes it receives, and a removal before upload simply never uploads. Bytes-first would need a pre-signed holding area with its own expiry.

- **Alternative: one multipart request creating row and bytes together, also from devices.** Kept for the API (D4) but not for devices: it needs the network at creation time, against local-first.
- **Alternative: polling `HEAD` for availability.** Rejected: online-only and a request per attachment per device.

### D4. Routes

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/tasks/{id}/attachments` | session or `full` token | multipart `file` (+ `comment_id`) or JSON `{name?, url}`; creates ops as the caller with device `server` plus the file; 201; honours `Idempotency-Key` through the existing derivation with collection `attachments` |
| `GET` | `/api/v1/tasks/{id}/attachments` | any | non-removed rows of the task, creation order, with `uploaded` |
| `PUT` | `/api/v1/attachments/{id}/content` | session or `full` token | raw body for a row the caller created; 204 |
| `GET` | `/api/v1/attachments/{id}/content` | any | `http.ServeContent` on the file (ranges, `If-None-Match`); headers per D6 |
| `PATCH` | `/api/v1/attachments/{id}` | session or `full` token | `{name}` → op |
| `DELETE` | `/api/v1/attachments/{id}` | session or `full` token | `deleted_at` op; 204 |
| `GET`/`PUT` | `/api/v1/settings/attachments` | any / owner | D5 |
| `GET` | `/api/v1/export?format=zip` | any | D12 |

Literal patterns win over `/{collection}/{id}` in the stdlib mux, as the comment routes already rely on (`server.go:245`). Readability is `sync.Get(ctx, uid, "attachment", id)`: found means the caller can see the scope; `not_found` for everything else so an id leaks nothing. `requireAuth` already refuses `read` and `agent` tokens on writes (`server.go:346-357`). Request logging records the path pattern only, as today.

Error codes: `attachment_mismatch` (400), `attachment_too_large` (413), `quota_exceeded` (403), `attachments_disabled` (403), `already_uploaded` (409), `rate_limited` (429), plus the usual envelope.

### D5. Limits, quota, settings and presets

Settings keys `attachments.enabled` (default true), `attachments.max_file_mb` (default 25, 1–2048) and `attachments.quota_mb` (default 1024, 0 = unlimited) in the `settings` table, read per request (no restart), audited as `settings.changed` like `mcp.*`. Optional `OPENTODO_ATTACHMENTS_MAX_FILE_MB` and `OPENTODO_ATTACHMENTS_QUOTA_MB` seed them once on a start where the keys do not exist (the backup-preset pattern, `internal/config/backup.go`); an invalid value stops startup naming the variable. Settings → Administration → Attachments is the owner's panel (screen id `settings/attachments`).

Quota = sum of `size` over the account's attachments with `author_id == uid`, `deleted_at == null`, `uploaded_at != null`, computed from `sync.List(ctx, uid, "attachment", false)` at upload time and for `/me`. No new table: a few thousand rows per account is what `List` already handles for tasks. Removal frees quota at once (the user's view); disk is freed by the retention purge (the operator's view, D13); the docs say both.

The per-file limit is checked three times, cheapest first: on the device before queuing (last known `/me.attachments`), at op receipt (`too_large`, so an oversized row never reaches other devices), and before reading an upload body (`Content-Length` against the limit and the quota; `MaxBytesReader` of the stored `size` guards the rest).

Rate limit: `attachmentLimiter = newRateLimiter(120, time.Hour)` per account on `PUT …/content` and `POST …/attachments`, the fixed-window limiter every other route uses.

### D6. Serving user files safely

Content responses set `Content-Security-Policy: default-src 'none'; sandbox` (the `sandbox` directive applies even when the response is navigated to, so a document the browser does render has no origin and no scripts), `X-Content-Type-Options: nosniff` (already global), `Content-Disposition: inline|attachment; filename*=UTF-8''<name>`, `Cache-Control: private, max-age=31536000, immutable`, `ETag: "<sha256>"`. The `Content-Type` is the stored `mime` only when it is in `inlineTypes` (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif`, `application/pdf`, `text/plain`, `audio/*`, `video/*`); otherwise `application/octet-stream` with `attachment`. SVG stays out of the allow-list on purpose (scripts and external references); it still renders in `<img>` where scripts never run, so SVG thumbnails work. Encrypted files are always `application/octet-stream`.

The app uses `<img src="/api/v1/attachments/{id}/content">` for thumbnails (same-origin, the session cookie rides along, `img-src 'self'`), and `blob:` URLs for decrypted previews (`img-src blob:` is already allowed). Opening a file is a plain navigation to the content URL in a new tab; downloading adds `?download=1`, which forces disposition `attachment`.

- **Alternative: a separate sandbox origin for user content.** Rejected: one container, one origin is the deployment contract; `sandbox` plus `nosniff` plus the allow-list gives the isolation that matters.

### D7. Client surfaces

- `app/task-detail/AttachmentsRow.tsx`: list (`useLiveQuery` on `attachments` by `task_id`, comment attachments excluded), states from `uploaded_at` and the local blob (`uploading`, `waiting` after a refusal, `available`, `missing` when the row exists but the content route answers 404), thumbnails for inline image types, actions Open, Download, Rename (inline field), Remove (with the app's undo toast, which writes `deleted_at: null`), and Add (hidden `<input type=file multiple>`, paste handler on the panel, drop zone). Keyboard: the row is a listbox; Enter opens, `Delete` removes after confirmation, `F2` renames. Placed below Subtasks in today's panel; `task-detail-redesign` moves it into its properties card.
- `Composer.tsx` gets an attach button; the files are listed under the composer and created in the same `mutateMany` batch as the comment with `comment_id`. `CommentsTab.tsx` renders them under the body; a deleted comment hides them.
- Task rows: a paperclip `<Icon>` with the count from a live query, next to the comment count (`useCommentCounts.ts` gets a sibling).
- `lib/attachments.ts`: `queueFile(taskId, file, commentId?)` (limit check, digest with `crypto.subtle.digest` on the `ArrayBuffer` for files up to the limit, D8 encryption when personal and encrypted, `mutateMany` + `attachmentBlobs.put`), `runUploader()`, `openAttachment(id)` (plain: navigate; encrypted: fetch, decrypt chunk by chunk into a `Blob`, object URL), `usage()` from the cached `/me`.
- Settings → Data: usage line; Settings → Administration → Attachments: the three owner fields. Both reachable by keyboard, both show last fetched state offline with actions disabled.
- Demo: `useDemo()` hides every control; `/me.attachments.enabled` is false on a demo instance.

### D8. Encrypted accounts: the device encrypts bytes in chunks

For an attachment in the personal scope of an encrypted account, the device stores and uploads an envelope under the account key:

```
header  = "OTAT1" || chunkSize(4, BE) || filePrefix(8 random bytes)           (17 bytes)
chunk_i = AES-256-GCM(key, nonce_i, plaintext_i, aad) || tag(16)
nonce_i = filePrefix(8) || index(3 bytes, BE) || final(1 byte: 0x01 on the last chunk)
aad     = utf8("attachment\0" + id + "\0") || header
```

Chunks are 1 MiB (the backup format's size, `docs/backups.md` "OTBK1"), so a 100 MB file is encrypted in 100 `crypto.subtle.encrypt` calls without holding the whole plaintext; the last chunk is marked final so truncation is detected; the id in the AAD binds the bytes to the attachment, as entity/id/field bind a text value today. The random per-file prefix keeps nonces unique under the one account key (2^64 space; the birthday bound is far beyond any account's file count). The server stores the envelope as opaque bytes: `size` and `sha256` describe the envelope, `encrypted: true` tells readers what it is, and `mime` is ciphertext, so the server serves `application/octet-stream` and the device, after decrypting, builds a `Blob` with the real type. Known-answer vectors for one small file go into `web/src/lib/e2ee.vectors.json` and are checked by the Go test suite too (`internal/e2ee/vectors_test.go`), although the server never decrypts.

Migration (enable or disable): `lib/e2eeSync.ts` `runMigration` gets a second phase after the content fields: for each file attachment of the personal scope in the wrong form, download, transform, create a new attachment row (new id, same `task_id`, `comment_id`, `name`, `created_at`) with the new bytes, upload, then tombstone the old row. Progress "n of m files", resumable because every step is idempotent on the server (the new row's existence is the checkpoint). Disabling deletes the key record only after the phase completes. Like the existing migration, it needs the network; unlike it, nothing happens while offline.

- **Alternative: one AES-GCM call over the whole file.** Rejected: WebCrypto is not streaming, and a 25 MB `encrypt` allocates plaintext and ciphertext at once on a phone; chunks also let a reader fail early on a bad chunk.
- **Alternative: a per-file content key wrapped under the account key.** Rejected for now; it buys key rotation without re-encryption, which the account key does not offer anyway.

### D9. Share target: `POST` with files and a custom service worker

`vite-plugin-pwa` switches from `generateSW` to `injectManifest` with `web/src/sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)`, the same `navigateFallback` with the same deny list, `cleanupOutdatedCaches`, and `importScripts('push-sw.js')` preserved (push-sw.js keeps its raw-API style and its tests). The worker adds one route: `POST /share` reads `event.request.formData()`, writes each file (`Blob`, name, type) and the text fields into an IndexedDB database `opentodo-share` (store `inbox`, key = a random id, `createdAt`), and answers `Response.redirect('/share?inbox=<id>', 303)`. `ShareCapture.tsx` reads `inbox` from the query, loads the entry, removes the query from the address bar as it does today, and deletes the entry on save, cancel, and in a startup sweep of entries older than ten minutes; `signOut` clears the database. The capture screen never sends the files anywhere before Save; on Save it calls `queueFile` for each (D3), so the offline path is the ordinary one.

Manifest `share_target`: `{action: '/share', method: 'POST', enctype: 'multipart/form-data', params: {title, text, url, files: [{name: 'files', accept: ['image/*', 'application/pdf', 'text/*', 'audio/*', 'video/*', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip']}]}}`. Browsers that cannot handle a `POST` share target (none that support share targets at all) are unaffected; the bookmarklet and extension keep `GET /share?…`.

- **Alternative: keep `generateSW` and pass files through the Cache API from a `runtimeCaching` plugin.** Rejected: Workbox's generated worker cannot handle a `POST` navigation; a custom worker is the documented way.
- **Alternative: hand files to the page through `client.postMessage` from the worker.** Rejected: the redirected page may not be a client yet when the worker is killed; IndexedDB is the reliable hand-over.

### D10. Extension: screenshots through an optional host permission

`extension/`: a second context-menu entry "Add screenshot to OpenTodo" (contexts `page`), `tabs.captureVisibleTab({format: 'png'})` (allowed by `activeTab` on the user's gesture, no new permission), then the usual `windows.create` popup with `&files=1` appended, then `scripting.executeScript({target: {tabId: popupTab}, func, args: [dataUrl, name]})` which calls `window.postMessage({type: 'opentodo-files', files: [{name, type, data}]}, location.origin)` inside the popup. Executing a script in the popup needs a host permission for the server origin, declared under `optional_host_permissions` and requested with `permissions.request({origins: [server + '/*']})` from the options page when the server URL is saved (a user gesture), with an explanation. Without it the popup opens with title and URL and a note. `ShareCapture.tsx` accepts the message only when `files=1` was in its URL, only from `event.source === window` and `event.origin === location.origin`, only once, and lists the file; a page elsewhere cannot post into the popup because it has no reference to it. The extension still makes no network request: the capture popup is the user's server, as before.

- **Alternative: "Add image" on `<img>` context menus by fetching `srcUrl`.** Rejected: a background fetch needs host permissions on arbitrary sites, and a fetch from the page context yields opaque responses for cross-origin images (most of them). The image URL still reaches the description as text, as any link does.
- **Alternative: a data URL in the `/share` query string.** Rejected: fragile above ~1 MB, and the bytes would travel in a request line to the server before Save.

### D11. Backups carry `attachments/` and restore streams it back

`writeArchive` (`internal/backup/archive.go`) appends, after `opentodo.db` and the extras, one tar entry per file from `blobs.Walk` as `attachments/<id[:2]>/<id>`, streamed with `io.Copy` through a `sha256` tee, and records `{name, size, sha256}` in the manifest. Because the manifest is the first entry and is written before the files are read, the manifest's file list is built from a directory walk taken right after the snapshot (names and sizes from `stat`), and the digest is added by walking twice (once for the manifest, once to stream); a file that changes size between the two (impossible: files are immutable) or disappears (purged meanwhile) fails the run, which the next scheduled run repeats. Memory stays at buffers plus the manifest (about 100 bytes per file).

`Restore` (`restore.go`) handles `attachments/…` entries like the database: verifies the size and digest of each while streaming it into `<data>/tmp/restore-…`, and, after the database swap, renames each into place (creating the two-level directories). Entries that are not under `attachments/` and not in `ExtraFiles` are skipped as today. Files already on disk that the archive does not list are kept: they are either newer (the orphan sweep, D13, deals with them after seven days if their rows never return) or restored rows will claim them. A corrupt file entry aborts before the swap because verification happens on the way into `tmp/`.

`docs/backups.md` gains the entry list and the arithmetic: the archive grows by the attachment bytes (gzip gains little on already-compressed files; compression stays one switch for the whole archive to keep the format a single stream), and with *keep last* 7 the destination holds up to seven copies of the files. Encryption at rest (`OTBK1`) covers them as part of the stream.

- **Alternative: a second archive per run for files.** Rejected: two objects per run complicate retention and restore for a size problem the docs can state.

### D12. Export ZIP and import of an own ZIP

`handleExport` with `format=zip` writes with `archive/zip` straight to the response: `export.json` first (the same document), then `attachments/<id>/<name>` for every readable attachment whose file exists, each `io.Copy`ed from `blobs.Open`; `Content-Disposition: attachment; filename="opentodo-export.zip"`; the `zip.Writer` uses the data-descriptor form, so sizes need not be known up front and nothing is buffered. Audit `export.requested` with format `zip`.

`internal/importer`: the own-export profile reads `attachments` from `export.json` and, for a ZIP upload, the `attachments/<id>/…` entries; file attachments are written through `blobs.Write` into the importing server's store (verifying `size` and `sha256`, applying the limit and quota, reporting refusals per row) and their rows get `uploaded_at` from the server; link attachments are rows only. The JSON-only path notes "n file attachments need the ZIP export". Undo tombstones the attachments the job created. The generic JSON and CSV profiles turn `attachment(s)`/`files` values that are `http(s)` URLs (strings, or objects with `url`/`file_url` and `name`/`file_name`) into link attachments and keep the warning for anything else. ZIP reading is the stdlib `archive/zip` over the uploaded file on disk (the import upload is already bounded by `OPENTODO_IMPORT_MAX_MB`; a ZIP export larger than that needs the limit raised, which the docs say). If `named-importers` lands first, its ZIP reader and entry limits are reused.

### D13. Lifecycle: purge, retention, orphans

- `Purgeable["attachment"] = true`; `Purge` of a task cascades to its attachments (every scope member's, like comments), `PurgeResult.Attachments` lists them for `purged` in sync responses, and after the transaction commits the server calls `blobs.Remove` for each (a file whose removal fails is logged and left to the orphan sweep).
- `PurgeExpired` also purges attachments whose `deleted_at` is older than the retention cutoff, through the same path and markers; the Trash view does not list attachments (removal is undone from the task's history or the app's undo).
- The orphan sweep runs in the retention job: `blobs.Walk` and, for each file whose id has no `attachment` row in any scope (`scope_fields`) and whose modification time is older than seven days, `Remove`. Seven days covers a restore from a week-old backup followed by devices re-seeding their rows (`reseedAfterRestore`).
- `OPENTODO_TRASH_RETENTION_DAYS=0` disables automatic purge of removed attachments too; their files then stay until the task is purged by hand.

### D14. Assistants

`agenttools.taskDetail` adds `attachments: []attachmentOut{ID, Size, Uploaded, CommentID, Untrusted{Name, Mime, URL}}` built from `sync.List(…, "attachment", false)` filtered by task and shown comments, capped at `MaxItems`; the in-app assistant's read tools share the registry, so it sees the same. No tool reads or returns content, no write tool takes attachments. For encrypted accounts the untrusted fields carry what the server holds (ciphertext), which `e2ee.Display` turns into the placeholder where server-built text is involved, as for titles.

### D15. Demo

`demoRules` gains `{"Attachments", false, prefix("/api/v1/attachments")}`, a matcher for `/api/v1/tasks/{id}/attachments` (like `projectInvites`) and the settings route is covered by the existing `/api/v1/settings` write rule plus a read rule so `GET` answers `demo_restricted` too; `/me.attachments.enabled` is false in demo mode. Link attachments are ops and would sync on the demo; the app hides the controls, so none are created from the UI, and a sandbox that syncs one by hand only stores a URL string within the existing byte budget.

## Risks / Trade-offs

- **[Old server, new client: `attachment` ops rejected as an unknown entity]** → The same path as every additive entity: the client drops the rejected rows and shows the notice; the release notes say to upgrade the server first. Blobs queued for rejected rows are dropped with them.
- **[A device fakes `size`/`sha256` and uploads different bytes]** → The server verifies both while streaming; a mismatch stores nothing. A device can still lie about `mime` (it is its own file; the allow-list and `sandbox` make the type harmless to the origin).
- **[Quota computed from `List` on every upload]** → One materialised read of the account's attachments, same cost as listing tasks; cached in the handler for the duration of a multipart request. If accounts reach tens of thousands of attachments, a `usage` column can be added later without a format change.
- **[Backups multiply the file bytes by the retention count]** → Documented with the arithmetic in `docs/backups.md`; the owner can lower *keep last* or set an age limit. Compression cannot be turned off per entry without a second stream, which is a deliberate non-goal.
- **[Restoring an old backup brings back purged files]** → Their rows are absent, so they are orphans; the sweep removes them after seven days. A restored database whose rows exist but whose files are missing shows "missing" in the app; `docs/backups.md` tells operators to restore from an archive that holds the files.
- **[Service worker rewrite (`injectManifest`) regresses precaching or push]** → The worker keeps the same Workbox calls and `importScripts('push-sw.js')`; `pushWorker.test.ts` still loads the raw file, and a new test asserts the built worker contains the precache manifest and the `/share` route. The layout check and the manual smoke cover an installed-app share.
- **[Encrypted migration re-uploads every file]** → It is the only way to keep "the server never sees content" true after enabling; progress and resumability keep it survivable. Accounts with many gigabytes are warned with the total before starting.
- **[`captureVisibleTab` on pages with sensitive content]** → The user chooses it per page; nothing is captured without the gesture, and the image goes only to their own server.
- **[Phone memory while hashing or encrypting a 25 MB file]** → Hashing reads the file through a `ReadableStream` in chunks; encryption is chunked (D8); the `Blob` of parts is lazy. Larger limits are the owner's choice, and the docs say the device needs the file in memory once per chunk, not whole.
- **[Disk full]** → `blobs.Write` returns the error, the temp file is removed, the upload answers 507 `insufficient_storage`, the device keeps the blob and retries later; the owner sees the error in the log.

**Size and memory.** No Go dependency; the binary grows by roughly 80 KB (blob store, handlers, archive and import code). The web bundle grows by an estimated 12–15 KB gzipped (row, composer button, uploader, chunked crypto, share inbox); the custom service worker is the same Workbox code the generated one contained. Runtime memory on the server is constant per transfer (two 32 KB buffers and a hash state) plus the backup manifest; the data volume grows by the stored bytes, bounded per account by the quota.

## Migration Plan

No data migration: the Dexie version adds two empty tables and the server creates `<data>/attachments/` on first use. Settings keys are absent until the owner saves (defaults apply). Rollback to the previous binary leaves `attachment` ops inert in the log (old clients ignore the table; the old server rejects new ones as unknown) and files on disk untouched; the next upgrade picks both up again. The share target change needs the app to be opened once (or reinstalled) before the share menu offers files, which `docs/capture.md` already says about share-target updates.

## Open Questions

- Should attachments appear in the activity feed and webhooks ("Alice attached receipt.pdf")? The fixture pins "no event" for now; adding kinds is additive and can be its own change once the feed's grouping (`task-detail-redesign`) has settled.
