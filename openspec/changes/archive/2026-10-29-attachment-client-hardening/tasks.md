## 1. Quota (L11)

- [x] 1.1 `sync.SetAttachmentQuota` and the restore check; wired in `registerAttachmentRoutes`
- [x] 1.2 Upload reservation in `checkRoom`
- [x] 1.3 `TestAttachmentQuotaHoldsOnRestoreAndUploadsInProgress` fails before; `go test ./internal/sync/ ./internal/httpapi/`

## 2. Cached files (L13)

- [x] 2.1 `private, no-cache` on content; `Clear-Site-Data: "cache"` on logout; `TestAttachmentUploadAndDownload` checks the headers, the 304 and the 401 without a session

## 3. Decrypted URLs (L12)

- [x] 3.1 `OriginChip` and `openAttachment` use `safeUrl`; `OriginChip.test.ts`, `attachments.test.ts`; `npm test`

## 4. Docs and checks

- [x] 4.1 Docs and CHANGELOG `### Security`
- [x] 4.2 `go test ./...`, `npm test`, `npm run build`, `make openspec-validate`
