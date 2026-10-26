# Attachment quota, cached files and decrypted links

## Why

An internal security audit found three low-severity gaps around attachments and links:

- **Quota bypass (L11).** Removing an attachment frees its quota, and restoring it was not checked, so remove, upload, restore stored more than the quota. Parallel uploads were each checked against the same free space.
- **Decrypted URLs (L12).** The server skips URL validation for encrypted values. After decryption, the origin chip rendered `<a href>` and a link attachment called `window.open` with whatever scheme the value had. The page's script policy blocks `javascript:` today; the app should not depend on it.
- **Files in the browser cache (L13).** Attachment content was served `max-age=1y, immutable`, and signing out did not touch the HTTP cache, so the next person on a shared browser could recover files.

## What Changes

- Restoring a removed attachment whose file is stored is rejected with `quota_exceeded` when it no longer fits its author's quota. Uploads in progress hold their size until the request ends.
- The origin chip and link attachments open only `http(s)` URLs as the device reads them.
- Attachment content is served `Cache-Control: private, no-cache` (a cheap 304 while signed in; nothing without a session). Signing out answers `Clear-Site-Data: "cache"`.

Not **BREAKING**: no op field, no route, no variable. One new rejection reason on an existing field (`quota_exceeded`, already a known error code in the app).

Out of scope: counting removed attachments until they are purged (the audit's first suggestion; a user could not free space for the whole Trash retention, since a removed attachment cannot be purged by hand), and changing the cache policy of profile pictures (the sign-out header covers them on https).

ROADMAP: hardening of shipped features (`attachments`, `task-origin`); no new item.

## Capabilities

### Modified Capabilities

- `attachments`: "Link attachments", "Download" and "Per-file and per-account limits".
- `task-management`: new requirement "Origin links open only http(s)".

## Impact

- `internal/sync/attachment_quota.go` (new), `internal/sync/attachments.go`, `apply.go`, `scope.go`, `service.go`; `internal/httpapi/attachments.go`, `auth_handlers.go`, `server.go`.
- `web/src/app/OriginChip.tsx`, `web/src/lib/attachments.ts`.
- Tests: `internal/httpapi/attachments_test.go`, `web/src/app/OriginChip.test.ts`, `web/src/lib/attachments.test.ts`.
- Docs: `docs/attachments.md` (or the attachments section of the guide), `docs/api.md`; CHANGELOG `### Security`.
