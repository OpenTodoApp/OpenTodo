# Proposal

## Why

A file attached from a phone whose clock runs ahead of the server never becomes available (issue #246): the upload answers 204, the server writes `uploaded_at` with its own clock, and that operation loses last-writer-wins against the device's creation of the row (which set `uploaded_at` to null with a later timestamp). The operation is silently dropped, every device shows "still uploading from another device" for good, and the server has answered success.

## What Changes

- The server's `uploaded_at` operation carries a timestamp greater than the field's current winning timestamp (and never earlier than the server's clock or any timestamp it issued), so the server's word wins whatever the device's clock said.
- When the operation is not applied all the same, the upload answers an error instead of 204, so the device keeps the file and retries.
- No op, data or settings change.

Out of scope: a general rule for other server-written fields (each already beats the stored value where it must, see `internal/sync/members.go`); client-side clock correction.

ROADMAP: hardens the shipped `attachments` item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `attachments`: "Upload confirmation is server-authoritative" (the server's write wins over a device clock that runs ahead).

## Impact

- `internal/sync/service.go` (`FieldTS`), `internal/httpapi/attachments.go` (`markUploaded`), `attachments_test.go` (`TestAttachmentUploadWithDeviceClockAhead`).
- `CHANGELOG.md`.
