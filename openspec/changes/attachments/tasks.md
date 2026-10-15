# Tasks

## 1. Entity, scope and lifecycle on the server (design D1, D3, D13)

- [x] 1.1 Add `attachment` to `internal/sync/ops.go` `Schema` with the fields of design D1 and a comment citing this change; extend `Validate` with the `name` rules (1–255 characters, no `/` or `\`) and the `url` scheme check. Verify with table-driven tests in `internal/sync` (`go test ./internal/sync/...`).
- [x] 1.2 Add `internal/sync/attachments.go` (`resolveAttachment`, batch notes, existing-row lookup) and the `case "attachment"` in `scope.go`; add `ReasonTooLarge` and a `WithAttachmentLimit` service option. Tests: viewer creates, forged author, rename by non-author, admin removes, immutable fields, comment of another author, comment of another task, size over the limit (`too_large`), purged task (`discard`), `uploaded_at` accepted only from device `server`. Verify with `go test ./internal/sync/...`.
- [x] 1.3 Reserve device `server` in `opsync.ReservedDevice` and on `/api/v1/sync` (`internal/httpapi/server.go:959-968`), with a handler test that a batch with device `server` is refused with 400 `invalid_op`. Verify with `go test ./internal/httpapi/...`.
- [x] 1.4 Lifecycle: `Purgeable["attachment"]`, cascade from task purge, `PurgeResult.Attachments`, `PurgeExpired` covering removed attachments, and a `blobs.Store` hook so purge removes files after commit; the orphan sweep (files older than seven days with no row) inside the retention job. Tests: purge of a task lists and removes its attachments' files; retention purges a 31-day-old removed attachment; a 3-day-old orphan is kept and an 8-day-old one deleted. Verify with `go test ./internal/sync/...`.
- [x] 1.5 Add an `attachment` op to `internal/activity/testdata/activity_fixture.json` that must produce no event. Verify with `go test ./internal/activity/...` and `web/src/lib/activity.test.ts` (`npm test` in web/).
- [x] 1.6 Document the entity, its scope and authorship rules, the reserved `server` device and the lifecycle in `docs/sync.md` (schema, purge and limits sections). Verify with `npm run docs:check` in web/.

## 2. Blob store, routes, limits and demo (design D2, D4, D5, D6, D15)

- [x] 2.1 Create `internal/blobs`: `Store` with `Path`, `Write` (temp file in `<data>/tmp`, tee into SHA-256, `LimitReader`, size and digest check, fsync, rename), `Open`, `Remove`, `Walk`, id validation. Tests: round trip, mismatch leaves no file, interrupted reader leaves no file, bad id refused, memory bounded (a 200 MB `io.Reader` written with `testing.AllocsPerRun`-style assertion on buffer size). Verify with `go test ./internal/blobs/...`.
- [x] 2.2 Settings and presets: keys `attachments.enabled`, `attachments.max_file_mb`, `attachments.quota_mb` with bounds and defaults in `internal/settings`; `OPENTODO_ATTACHMENTS_MAX_FILE_MB` and `OPENTODO_ATTACHMENTS_QUOTA_MB` in `internal/config` (invalid value stops startup; seeded once); `GET`/`PUT /api/v1/settings/attachments` with the `settings.changed` audit event. Tests: owner saves, member 403, anonymous 401, out of bounds 400, invalid preset error, preset applied once. Verify with `go test ./internal/config/... ./internal/httpapi/...`.
- [x] 2.3 Routes in `internal/httpapi/attachments.go`: `PUT …/content` (author check, `Content-Length` against limit and quota, `blobs.Write`, `uploaded_at` op as device `server`, `NotifyApplied`), `GET …/content` (`http.ServeContent`, headers of design D6, `?download=1`), `POST /api/v1/tasks/{id}/attachments` (multipart stream and JSON link, `Idempotency-Key`), `GET` list, `PATCH` name, `DELETE`; 120/hour limiter; `/me` gains `attachments` usage. Tests per spec scenario: 204 and `uploaded_at` set, 401, mismatch 400, non-author 404, second upload 409, too large 413, quota 403, disabled 403, read token 403, download 200 with every header, range 206, HTML served as octet-stream attachment, SVG as attachment, PNG inline, not-uploaded 404, rate limit 429, disk full 507. Verify with `go test ./internal/httpapi/...`.
- [x] 2.4 Demo deny list in `internal/httpapi/demo.go` for `/api/v1/attachments`, `/api/v1/tasks/{id}/attachments` and `/api/v1/settings/attachments` (every method), and `attachments.enabled: false` in `/me` on a demo instance. Verify with `TestDemoRestricted*` additions (`go test ./internal/httpapi/...`).
- [x] 2.5 Write `docs/attachments.md` (what, limits, who can see and remove, links, offline behaviour, encryption, privacy of the content route, where files live) and the API section in `docs/api.md` (routes, error codes, headers, settings, usage); add the two variables and the `attachments/` directory to the README configuration table and `docs/self-hosting/docker.md`. Verify with `npm run docs:check` in web/ and `make docs` (twice, no diff).

## 3. Backups and restore (design D11)

- [x] 3.1 `internal/backup/archive.go` and `run.go`: walk the blob store after the snapshot, list `attachments/<id[:2]>/<id>` entries with size and digest in the manifest, stream each into the tar. Tests: an archive with 3 files lists and contains them; a file removed between walk and stream fails the run cleanly; memory stays bounded for a 300 MB fixture made of a sparse file. Verify with `go test ./internal/backup/...`.
- [x] 3.2 `internal/backup/restore.go`: stream `attachments/…` entries into `tmp/` with verification, rename into place after the database swap, keep unlisted files, abort before the swap on a bad digest. Tests: round trip restores files byte for byte, corrupt entry changes nothing, an old archive without attachments restores as before. Verify with `go test ./internal/backup/...`.
- [x] 3.3 Update `docs/backups.md`: the entry list, the manifest example with file entries, the size arithmetic with retention, and the restore note about files. Verify with `npm run docs:check`.

## 4. Export and import (design D12)

- [x] 4.1 `handleExport`: `attachments` array in the JSON document; `format=zip` streaming `export.json` plus `attachments/<id>/<name>`; 400 `invalid_input` for other formats; audit with the format. Tests: JSON includes removed attachments; ZIP contains the document and every uploaded file with matching bytes; anonymous 401; encrypted account's ZIP holds the stored envelope. Verify with `go test ./internal/httpapi/...`.
- [x] 4.2 `internal/importer`: own-export profile reads `attachments` (rows with original ids; files from a ZIP through `blobs.Write` with limit and quota per row; JSON-only note of file count); generic JSON and CSV profiles map `http(s)` attachment references to link attachments and keep the warning otherwise; undo tombstones attachments; the preview counts attachments. Tests in `profiles_test.go`, `service_test.go` and `completeness_test.go` for each spec scenario. Verify with `go test ./internal/importer/...`.
- [x] 4.3 Update `docs/import-export.md` (ZIP export, what the JSON alone restores) and `docs/import.md` (attachment columns and fields now kept as links, the ZIP format). Verify with `npm run docs:check`.

## 5. Assistants (design D14)

- [x] 5.1 `internal/agenttools/read.go` and `resources.go`: `attachments` in `taskDetail` with untrusted name, type and link, size, upload state and comment id; no content. Tests: a task with a file and a link attachment; an encrypted account's attachment shows ciphertext or placeholder; `tools/list` unchanged. Verify with `go test ./internal/agenttools/... ./internal/mcp/...`.
- [x] 5.2 Document the field in `docs/mcp.md` and `docs/assistant.md`. Verify with `npm run docs:check`.

## 6. Client data layer and uploader (design D1, D3, D7)

- [ ] 6.1 Types and defaults: `Attachment` in `web/src/lib/types.ts`, `ATTACHMENT_DEFAULTS` in `lib/ops.ts`, the next free Dexie version with `attachments` and `attachmentBlobs` (every store redeclared) in `lib/db.ts`, entity maps in `lib/e2eeSync.ts` (`tableOf`, `personalResolver` via `task_id`), `lib/assistant.ts` and `lib/trash.ts` (`removeLocally` drops blobs). Verify with a vitest that applies remote `attachment` ops, reads them back and drops rows and blobs on `purged` (`npm test` in web/).
- [ ] 6.2 `lib/attachments.ts`: `queueFile` (limit check from cached `/me`, streamed SHA-256, `mutateMany` + blob row, optional `comment_id`), `queueLink`, `runUploader` (after a sync round with an empty outbox; oldest first; skips tombstoned rows and rows with outbox ops; XHR `PUT` with progress; 404 waits, 413/403/429 keep with reason, 204 deletes the blob), `removeAttachment` (tombstone; drops an unuploaded blob), `openAttachment`, `usage`. Tests with a mocked API: three files upload in order after the ops batch; removed-before-upload never uploads; rejected creation drops the blob; quota refusal keeps the blob as waiting. Verify with `npm test` in web/.
- [ ] 6.3 Wire the uploader into `lib/sync.ts` after `runOnce` succeeds and on `online`, and clear `attachmentBlobs` and the share inbox at sign-out. Verify with the sync tests (`npm test`) and `npm run build` in web/.
- [ ] 6.4 API client: `api.attachments` helpers, `/me.attachments` in the profile type and the cached profile. Verify with `npm test` and `npm run build`.

## 7. Client surfaces (design D7)

- [ ] 7.1 `app/task-detail/AttachmentsRow.tsx`: list with states and thumbnails, Open, Download, Rename, Remove with undo, Add by picker, paste and drop, keyboard model (listbox, Enter, Delete, F2), the demo and `enabled: false` cases, placed below Subtasks; stories in `attachments.stories.tsx`. Component tests for the four spec scenarios (keyboard add and open, paste, offline open, row count) plus an axe check. Verify with `npm test`, `make ui-check` and `npm run build` in web/.
- [ ] 7.2 Comments: attach button in `Composer.tsx` creating the comment and its attachments in one batch; attachments rendered under the body in `CommentsTab.tsx`; hidden for a deleted comment. Tests in `commentsTab.test.tsx`. Verify with `npm test`.
- [ ] 7.3 Task rows: paperclip count beside the comment count, from a live query (`useAttachmentCounts.ts`). Verify with the task list tests (`npm test`).
- [ ] 7.4 Settings: usage line in Settings → Data and the owner panel Settings → Administration → Attachments (three fields, bounds, offline state), screen id `settings/attachments`, help ids; update `docs/settings.md`. Verify with the `settingsSections` test, a component test for the panel, `npm run docs:check` and `npm run build`.

## 8. Encrypted accounts (design D8)

- [ ] 8.1 `lib/crypto.ts`: `encryptFile`/`decryptFile` with the OTAT1 chunked format (header, nonces, AAD with the attachment id, final flag), streaming over a `Blob` in 1 MiB chunks into a `Blob` of parts; vectors for a small file in `e2ee.vectors.json`, checked by `internal/e2ee/vectors_test.go` too. Tests: round trip, truncation detected, reordered chunk detected, wrong id detected. Verify with `npm test` in web/ and `go test ./internal/e2ee/...`.
- [ ] 8.2 `name`, `mime`, `url` in `internal/e2ee.ContentFields` and `CONTENT_FIELDS`; `queueFile` encrypts when the row is personal and the account is encrypted (`encrypted: true`, envelope size and digest); `openAttachment` decrypts to a `blob:` URL; the server serves `encrypted` rows as `application/octet-stream`. Tests: an encrypted account's upload stores the envelope and the server never sees the plaintext digest; opening decrypts. Verify with `npm test` in web/ and `go test ./internal/httpapi/...`.
- [ ] 8.3 Migration phase in `lib/e2eeSync.ts` `runMigration`: re-upload files in the right form as new rows, tombstone the old ones, progress "n of m files", resumable, offline pause; disabling deletes the key record only after the phase. Tests for the three spec scenarios with a mocked content route. Verify with `npm test`.
- [ ] 8.4 Update `docs/e2ee.md` (encrypted set, file format, migration, size note). Verify with `npm run docs:check`.

## 9. Share target and service worker (design D9)

- [ ] 9.1 Switch `web/vite.config.ts` to `injectManifest` with `web/src/sw.ts`: precaching, navigation fallback with the same deny list, outdated-cache cleanup, `importScripts('push-sw.js')`, and the `POST /share` route writing files and fields into the `opentodo-share` IndexedDB and redirecting 303 to `/share?inbox=<id>`. Tests: the built worker contains the precache manifest, the deny list and the share route (a vitest reading `internal/web/dist/sw.js` after `npm run build`); `pushWorker.test.ts` still passes. Verify with `npm test` and `npm run build` in web/.
- [ ] 9.2 Manifest `share_target` as `POST multipart/form-data` with `files`; verify with a test on the built `manifest.webmanifest` (`npm test` after `npm run build`).
- [ ] 9.3 `ShareCapture.tsx` and `lib/share.ts`: read the inbox entry, list files (name, type, size, thumbnail, remove), refuse over-limit files and more than 10, create the task and attachments in one batch on Save, delete the entry on save and cancel, sweep entries older than ten minutes at startup, hide files on the demo. Tests in `ShareCapture.test.ts` for the spec scenarios (photo offline, text with a file, oversized file, cancel removes the entry, HTML file listed only). Verify with `npm test` and `npm run build`.
- [ ] 9.4 Update `docs/capture.md` (files from the share sheet, the hand-over store, limits; remove the "cannot be shared yet" line). Verify with `npm run docs:check`.

## 10. Browser extension (design D10)

- [ ] 10.1 `extension/`: "Add screenshot to OpenTodo" context-menu entry with `captureVisibleTab`, `optional_host_permissions`, the options page requesting the server origin on save with an explanation, the popup opened with `files=1`, and the injected `postMessage` hand-over; the no-permission note path. Bump the extension version; keep "no network requests". Tests in `share-url.test.js` for the URL with `files=1` and a unit test of the hand-over message shape. Verify with `make extension` and a manual load in Chromium and Firefox recorded in the change folder notes.
- [ ] 10.2 `ShareCapture.tsx` accepts the `opentodo-files` message once, only with `files=1`, only from `event.source === window` and the page's origin. Test: a message from another source is ignored. Verify with `npm test`.
- [ ] 10.3 Update `docs/capture.md` (extension section: the screenshot action and the optional permission) and `extension/README.md`. Verify with `npm run docs:check`.

## 11. Integration

- [ ] 11.1 Manual smoke on `make dev`: attach a file offline on one browser profile, reconnect, see it become available on a second profile of the same account; share a photo from an installed Android app (or the layout script's share simulation) and save; enable encryption on an account with files and open one on a second device; run a backup, restore it on a fresh data directory and open the files; export ZIP and import it into another account. Record the results in the change folder notes.
- [ ] 11.2 Layout check covers the Attachments row, the comment attachment list and the capture screen with files at 360 px, light and dark; verify with the layout script on port 18081 with Chromium.
- [ ] 11.3 Run `make check` (go test, web test and build, ui lint, docs check). Verify it passes.

## Workflow follow-up

- Add the ROADMAP.md row 5 outcome under "Shipped" and point the comparison pages' `attachments` claims at `docs/attachments.md` (website repository).
- Add a CHANGELOG.md entry under Unreleased ("Attachments on tasks and comments: files and links, share sheet and screenshots, backups, export, encryption").
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
