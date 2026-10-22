# Tasks

## 1. Server

- [x] 1.1 `Service.FieldTS` and `markUploaded` with `ServerTSAt(max(now, fieldTS+1))`, an error when nothing applied; verify `TestAttachmentUploadWithDeviceClockAhead` (a device 90 s ahead; the row is uploaded and the device receives `uploaded_at`) fails without the change and passes with it, `go test ./internal/httpapi/... ./internal/sync/...` — done

## 2. Documentation

- [x] 2.1 `CHANGELOG.md` Fixed entry — done
