## 1. Build

- [x] 1.1 `resolveAttachment`: `uploaded_at` on an existing attachment only from the server, except the author's repeat of `null` while it is `null`; a read error refuses
- [x] 1.2 `handleUploadAttachment`: a stored file whose row reads not uploaded is marked uploaded again (204); an uploaded row still answers 409
- [x] 1.3 Tests: `TestUploadedAtOfAStoredAttachmentIsTheServers` (a viewer, an admin and the author), `TestAttachmentUploadRepairsAStoredFileMarkedNotUploaded`

## 2. Checks

- [x] 2.1 `go test ./internal/sync ./internal/httpapi`; `make openspec-validate`; `make repo-check`
