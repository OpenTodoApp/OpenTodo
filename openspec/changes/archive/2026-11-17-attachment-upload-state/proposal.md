## Why

The upload state of a stored attachment (`uploaded_at`) is the server's to write. The rule is stated in "Upload confirmation is server-authoritative", and the resolver now applies it to every existing row. A row that reads not uploaded while its file is stored cannot be put right today: the upload route answers 409 `already_uploaded` as soon as the file exists.

## What Changes

- For an existing attachment, `uploaded_at` from a device is refused. The one exception is the author repeating the `null` of their own create (a retried batch) while the file is not stored.
- An upload for an attachment whose file is already stored but whose row reads not uploaded marks it uploaded again (204, with the shared copies too), without reading the body. An attachment that reads uploaded still answers 409.

## Capabilities

### Modified Capabilities

- `attachments`: "Upload of file bytes" (the repair) and "Upload confirmation is server-authoritative" (existing rows).

## Impact

- `internal/sync/attachments.go` (`resolveAttachment`), `internal/httpapi/attachments.go` (`handleUploadAttachment`).
- No op, schema or client change. No new route.
