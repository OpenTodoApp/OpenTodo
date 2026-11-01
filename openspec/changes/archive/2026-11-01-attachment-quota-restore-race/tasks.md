# Tasks

## 1. Shared ledger

- [x] 1.1 Add `QuotaHolds` to `internal/sync/attachment_quota.go` (hold, conditional hold, release once), owned by `Service` and exposed as `Service.QuotaHolds()`. Verify `go test ./internal/sync -run TestQuotaHolds -race`
- [x] 1.2 Make a restore that fits hold its size until its batch ends (`Service.apply` defers the release, which runs after the commit). Verify with the httpapi tests in 2.1

## 2. Upload route

- [x] 2.1 Make `checkRoom` hold the size in the ledger before it reads the stored rows, keeping `uploadsMu` only to serialise one account's checks. Verify `go test ./internal/httpapi -run 'TestAttachmentQuota' -race -count=200`: a restore while a gated upload is in flight is refused with `quota_exceeded`, and a racing restore and upload never both succeed
