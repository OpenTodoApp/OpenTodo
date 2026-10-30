# Design: attachment-client-hardening

## D1. The quota holds on restore and under parallel uploads

- `sync.Service.SetAttachmentQuota(func() int64)`, read before the transaction like the per-file limit and handed to the resolver. In `resolveAttachment`, a `deleted_at = null` op on an attachment that is currently removed and uploaded is rejected with `quota_exceeded` when the author's live uploaded bytes plus its size exceed the quota (one SQL sum over `scope_fields` in the batch's transaction). The author, not the restorer, is charged, as the quota counts what an account authored.
- `Server.checkRoom` reserves the upload's size in an in-memory map per account under a mutex, released by `context.AfterFunc` when the request ends; by then a stored upload counts through its row.
- Rejected: counting removed attachments until purged. It closes the same hole without a sync change, but a removed attachment cannot be purged by hand, so a user at the quota could not upload for the whole Trash retention (30 days by default). Removed files can still take disk space beyond the quota until purged, bounded by the upload rate limit (120 per hour) and the retention.

## D2. Cached files

`Cache-Control: private, no-cache` with the existing digest ETag: the browser revalidates every use (304, no body, while the session is valid) and cannot show the file without a session. Logout sends `Clear-Site-Data: "cache"`; browsers honour it only in secure contexts (https, localhost), hence the cache policy as well. Avatars keep their long cache (low sensitivity, rendered in every list).

## D3. Decrypted URLs

`safeUrl` (http and https only, `web/src/lib/share.ts`) guards both sinks: the origin chip renders without a link, and `openAttachment` opens nothing for another scheme.

## Data model

None.

## Size and memory

None; one map entry per account with an upload in progress.

## Interface budget

No new chrome; the origin chip loses its link only for an unsafe URL.
