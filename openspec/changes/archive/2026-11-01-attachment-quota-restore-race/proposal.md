# Proposal

## Why

Issue #676: restoring a removed attachment through sync (clearing `deleted_at`) checks the quota against the stored bytes only. Uploads in progress hold their size in a map private to the upload route (`internal/httpapi/attachments.go`), which the restore check inside the sync transaction (`internal/sync/attachment_quota.go`) cannot see. A restore that lands while an upload is streaming can therefore take an account over its quota by one file. Taking the upload route's lock inside the sync transaction would risk a lock-order deadlock (the route reads usage while holding it, which may wait for the one writer connection).

## What Changes

- One ledger of held attachment bytes per account, owned by the sync service (`sync.QuotaHolds`), consulted by both paths. An upload holds its size there until its handler ends, as before. A restore that fits holds its size there until its batch committed or rolled back, so an upload starting meanwhile counts it.
- The upload route holds first and reads the stored rows second; a restore reads the rows inside its transaction (which holds the one writer connection, so no upload can commit in between) and then checks and holds in the ledger under one lock. Every holder releases only after its bytes are in the stored rows, so a file is always counted at least once; for a moment perhaps twice, which only refuses early.
- The ledger's lock is a leaf: nothing holding it touches the database or takes another lock. The upload route's own lock (which serialises an account's room checks, so exactly one of two parallel uploads gets the last room) is never taken by the sync transaction. No new lock-order risk.
- The attachments spec gains a scenario for a restore during an upload.

Out of scope: the per-file limit, the quota settings, and the client's handling of `quota_exceeded` (unchanged).

Advances no ROADMAP item; fixes issue #676.
