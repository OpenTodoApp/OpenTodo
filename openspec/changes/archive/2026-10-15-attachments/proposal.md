# Proposal

## Why

A task often *is* a file: the receipt to claim, the PDF to read, the screenshot of the bug, the photo of the broken part. OpenTodo cannot hold any of them. The share sheet only takes text and links (`web/vite.config.ts:26-34` registers a GET share target and `docs/capture.md` ends with "Files and images cannot be shared yet"), the importers drop every attachment with a warning (`internal/importer/profile_json.go:222-223`, `internal/importer/profile_csv.go:49`), and the comparison pages on open-todo.app concede attachments to Todoist, Things and Linear. The roadmap row 5 asks for files and images on tasks and comments, stored under the one data directory, bounded, backed up, exported, served with authentication, encrypted on the device for end-to-end encrypted accounts and refused on the demo.

## What Changes

- **Attachments on tasks and comments.** A task, or a comment on it, can carry files. The task detail gets an Attachments row (add from a file picker, paste or drop; open, download, rename, remove), the comment composer an attach action, and task rows a paperclip count. Images show a thumbnail; everything else shows name, type and size.
- **Metadata as operations, bytes as files.** Each attachment is a new, additive op-log entity `attachment` (its task, optional comment, name, type, size, digest, author, timestamps, an optional link) that lives in its task's sharing scope and follows the comment authorship rules. The bytes live as one immutable file per attachment under `<data>/attachments/`, streamed in and out, never buffered whole. Files are never in the op log.
- **Offline first.** Adding a file offline creates the metadata operation and keeps the bytes on the device; the next sync pushes the operation, then uploads the bytes. Other devices see the attachment as "uploading" until the server confirms it with a server-written `uploaded_at`, like a reminder's `delivered_at`.
- **Link attachments.** An attachment may be a link (`url`) with no file. The importers keep attachment references they can only see as URLs (Todoist, Things and generic JSON/CSV `attachment` columns) as link attachments instead of dropping them.
- **Routes.** `POST`/`GET /api/v1/tasks/{id}/attachments`, `PUT`/`GET /api/v1/attachments/{id}/content`, `PATCH`/`DELETE /api/v1/attachments/{id}`, owner settings at `/api/v1/settings/attachments`, usage in `GET /api/v1/me`, and `GET /api/v1/export?format=zip`. Every route requires authentication; downloads carry `Content-Disposition`, `nosniff` and a `sandbox` content security policy, and only an allow-list of types is ever served inline.
- **Limits.** Per file (default 25 MB) and per account (default 1 GB), set by the owner in Settings → Administration → Attachments, optionally preset once with `OPENTODO_ATTACHMENTS_MAX_FILE_MB` and `OPENTODO_ATTACHMENTS_QUOTA_MB`; uploads rate limited per account; Settings → Data shows the account's usage.
- **End-to-end encrypted accounts** encrypt name, type, link and the file bytes on the device (chunked AES-256-GCM under the account key); the server stores and serves opaque bytes and never holds a key. Enabling or disabling encryption re-uploads existing files as part of the migration.
- **Share sheet and extension.** The web share target switches to `POST` with files, handled by a custom service worker that hands them to the capture screen through a local hand-over store, so a photo shared from the phone becomes a task with an attachment, offline included. The browser extension gains "Add screenshot to OpenTodo" (visible tab), handed to the capture popup with an optional host permission for the user's own server.
- **Backups, export, purge.** Backup archives carry `attachments/` after the database, listed in the manifest with size and digest, streamed, and `opentodo restore` puts them back. The JSON export lists attachment metadata; the new ZIP export adds the files; an own ZIP export imports with its files. Purging a task removes its attachments' files; removed attachments' files go with the Trash retention; orphan files are swept.
- **Assistants** (MCP tools, resources and the in-app assistant) see attachment names, types and sizes as untrusted data and never the content. The demo instance refuses every attachment route and hides the controls.

Out of scope:
- Previews beyond image thumbnails (no PDF or office rendering), image editing, OCR or search inside files.
- Attachments on projects, labels or saved views, and inline images inside notes or comment bodies (the notes editor keeps its own rules).
- Activity-feed events and webhook events for attachments; notifications when someone attaches a file. The fixtures pin that `attachment` ops derive no event, so a later change can add them.
- CalDAV `ATTACH` properties, CLI (`ot`) commands and agent write tools for attachments.
- Server-side fetching of a URL into a file (a third-party request the server never makes), and the extension capturing images by URL (needs host permissions on arbitrary sites; see design D10).
- Multi-tenant quotas and billing (`multi-tenant-host` can build on the per-account setting).

ROADMAP: advances **Next: Parity and depth**, row 5 "Attachments" (`attachments`). Refinements to the row's notes: link attachments give the importers a target; the extension contributes screenshots rather than files from the page; removed attachments keep their file for the Trash retention period so a removal can be undone from any device.

Nothing here is **BREAKING**. The op log gains one entity (additive); the device id `server` becomes reserved on `/api/v1/sync` exactly as `agent:` and `caldav:` are, which no client has ever used (device ids are random UUIDs). The two environment variables are optional presets. No new mandatory variable.

Coordinates with `named-importers` (both read ZIP uploads in `internal/importer`; whichever lands second reuses the other's ZIP reader, and the named profiles map their file URLs to link attachments by the rule in the `data-import` delta) and with `task-detail-redesign` (the Attachments row goes into its properties card; until it lands the row is appended below Subtasks in the current panel).

## Capabilities

### New Capabilities
- `attachments`: files and links on tasks and comments: the metadata entity and its authorship, the file store and its limits, upload, download and removal routes and their security, offline queuing and convergence, the client surfaces, usage display and owner settings, the assistant view and the file lifecycle (purge, retention, orphans).

### Modified Capabilities
- `share-capture`: the share target becomes a `POST` with files; the signed-out rule allows the device-local hand-over store; the extension gains the screenshot action and an optional host permission; payload limits cover files; a new requirement for shared files on the capture screen.
- `end-to-end-encryption`: attachment name, type, link and file bytes join the encrypted set (file bytes with a chunked format); the enable/disable migration re-uploads files.
- `backups`: archives include the attachment files after the database, manifest-listed and streamed; restore puts them back.
- `http-api`: the export lists attachments and gains `format=zip` with the files.
- `data-import`: attachment references become link attachments instead of warnings; an own ZIP export restores files; undo tombstones imported attachments.
- `trash-and-history`: purging a task removes its attachments and files; the retention job also purges removed attachments and their files.
- `demo-mode`: every attachment route refused, controls hidden.
- `mcp-server`: attachment metadata in `get_task` and the task resource as untrusted data, no content.

## Impact

- **Op schema:** `attachment` in `internal/sync/ops.go` `Schema` (fields in design D1), a scope resolver branch beside `comment` in `internal/sync/scope.go` and a `resolveAttachment` in a new `internal/sync/attachments.go`; `Purgeable`/`PurgeResult` in `internal/sync/trash.go`; `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`, a Dexie `attachments` table and an `attachmentBlobs` table (the next free Dexie version), entity maps in `lib/e2eeSync.ts`, `lib/assistant.ts` and `lib/trash.ts`; `docs/sync.md`. `name`, `mime` and `url` go into `internal/e2ee.ContentFields` and `CONTENT_FIELDS`. `internal/activity` and `lib/activity.ts` derive no event (fixture entry).
- **Server:** new `internal/blobs` (file store: paths, streaming write with digest, open, delete, sweep); `internal/httpapi/attachments.go` (routes, limits, headers, settings), `server.go` (`/me` usage, export ZIP, reserved device `server`), `demo.go` (deny list); `internal/backup/archive.go`, `run.go`, `restore.go` (directory entries); `internal/importer` (link attachments, ZIP of an own export, undo); `internal/agenttools/read.go` and `resources.go`; `internal/config` (two optional presets); `internal/settings` keys `attachments.*`.
- **Web:** `lib/attachments.ts` (queue, uploader, download/decrypt, usage), `lib/crypto.ts` (chunked file encryption), `app/task-detail` Attachments row and composer button, `app/ShareCapture.tsx` files, `src/sw.ts` (custom service worker with the share `POST` handler, `injectManifest`), `vite.config.ts` (share target), `SettingsView` (Administration → Attachments; Data → usage), `extension/` (screenshot action, optional host permission, options page).
- **Docs:** new `docs/attachments.md`; `docs/capture.md`, `docs/backups.md`, `docs/import-export.md`, `docs/import.md`, `docs/e2ee.md`, `docs/api.md`, `docs/mcp.md`, `docs/sync.md`, `docs/self-hosting/docker.md`, README configuration table, CHANGELOG, ROADMAP.
- **Size:** no Go dependency (`archive/zip`, `archive/tar`, `crypto/sha256`, `mime` are stdlib); the binary grows by roughly 80 KB. No web runtime dependency; the custom service worker imports `workbox-precaching` and `workbox-routing`, which `vite-plugin-pwa` already ships for its generated worker. The main bundle grows by an estimated 12–15 KB gzipped. Runtime memory is constant per transfer (streaming with fixed buffers); the volume grows by the sum of the attachment files, and so does every backup archive (design D11).
