# Design

## Context

All state lives in one SQLite file under `/data` (WAL mode, single connection). The container is distroless: no shell, no cron, no `sqlite3` CLI, so backups must be driven by the binary itself. The op log is append-only per user with a monotonically increasing `seq` that devices use as their sync cursor; a restore moves the server back in time, which breaks the assumption that cursors only grow. The owner role exists; a `settings` store does not yet.

## Goals / Non-Goals

**Goals:**
- Zero-configuration default remains: nothing runs until the owner enables it.
- Consistent snapshots without downtime; bounded memory; works on a Raspberry Pi.
- No new mandatory dependency; destinations implemented with the standard library.
- Restore that an operator can perform at 2 a.m. with the binary and the docs.
- Devices never silently lose post-backup edits after a restore.

**Non-Goals:**
- Per-user backups (the export covers that), UI-driven live restore, point-in-time recovery, destinations beyond local / S3-compatible / WebDAV, failure notifications (a `backup.failed` webhook event can be added by the `webhooks` change later).

## Decisions

### D1. Snapshot by `VACUUM INTO` a temp file
Chosen: the server runs `VACUUM INTO '<data>/tmp/snapshot-<ts>.db'` on its single connection, then packages that file. It yields a compact, consistent, WAL-free copy at one point in time and is supported by the pure-Go SQLite driver already in use.
- Alternative: copy `opentodo.db` + `-wal` files. Not consistent without a checkpoint and an exclusive lock. Rejected.
- Alternative: the SQLite online backup API. Not exposed by the driver without CGO. Rejected.
- Cost: one full read of the database; for a personal data set (tens of MB) it takes under a second and briefly blocks other writers behind the single connection, acceptable at the chosen schedule.

### D2. Archive format
A `tar` stream: `manifest.json` first, then `opentodo.db`. Optionally gzip-compressed (manifest states `compression`). The archive excludes `<data>/secrets/` and `<data>/backups/`. Name: `opentodo-<YYYYMMDD-HHMMSS>-<generation8>.tar[.gz][.enc]`.
- Why tar: standard library, streamable, extensible (future changes can add attachments as more entries without breaking restore).

### D3. Encryption: passphrase → argon2id → AES-256-GCM in 1 MiB chunks
Header `OTBK1` + salt + chunk size; each chunk sealed with a nonce derived from the chunk index; final chunk flagged so truncation is detected. Argon2id parameters match the password hasher (19 MiB, t=2, p=1). Documented byte-for-byte in `docs/backups.md`, with a pointer that the same code path is used by `opentodo restore` so no external tool is required.
- Alternative: age or similar. A good format but another dependency and another tool for the operator; the chunked GCM construction is small and well understood. Rejected for now; the header version byte allows switching later.
- Alternative: encrypt the whole database inside SQLite. Not available without extensions. Rejected.

### D4. Destinations over `net/http`
- Local: write to a temp file in the destination directory and rename.
- S3-compatible: SigV4-signed `PutObject`, `ListObjectsV2`, `DeleteObject`, optional path-style addressing; single-part uploads up to 5 GB cover every realistic database; multipart can be added later.
- WebDAV: `PUT`, `PROPFIND` (depth 1), `DELETE`, `MKCOL` for the first run, Basic auth over HTTPS (HTTP allowed only when the owner explicitly accepts the warning).
- All uploads stream from the archive writer; peak memory is the 1 MiB encryption chunk plus HTTP buffers.
- Alternative: the AWS SDK. Adds roughly 8–12 MB to the binary and far more to compile time; rejected for three operations that fit in ~300 lines.

### D5. Scheduler and runs
A single goroutine started with the server computes the next run from the stored schedule (`hourly|daily|weekly`, time of day, weekday) in the server's local time zone, runs the backup, applies retention, records a row in `backup_runs(id, started_at, finished_at, status, bytes, destination, archive_name, error)`, and prunes rows older than 90 days. A missed run is detected at startup by comparing the last successful run with the schedule. Manual runs reuse the same function behind a mutex (second caller gets 409).

### D6. Settings and secrets
New `settings(key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)` table shared with other owner-level toggles (CalDAV, MCP, webhook policy) to avoid one table per integration. Non-secret backup settings live there as one JSON value. Secrets (`s3_secret_key`, `webdav_password`, `passphrase`) live in `<data>/secrets/backup.json` with mode `0600`, created by the server; the API reports `has_secret_key: true` style flags only. Optional `OPENTODO_BACKUP_*` env vars seed settings on first start only; afterwards the UI value is authoritative, which keeps "no mandatory env var" and "manageable from the UI" both true.

### D7. Restore and log generation
`opentodo restore <archive> [--passphrase-file f]` runs with the server stopped: it verifies, decrypts, checks `schema_version <= current`, copies `opentodo.db` to `opentodo.db.pre-restore-<ts>`, swaps the file, and writes a fresh random `generation` into the restored database's `settings`. The server includes `generation` in every `/api/v1/sync` response (additive field). The client stores it in `meta`; on mismatch it sets `cursor = 0`, keeps the outbox, and re-emits every field of every local row as a new op `{id: new, entity, entityId, field, value, ts: storedTs, device: storedDevice}` in batches of 1,000, then pulls. Because the client already stores `(ts, device)` per field for LWW, this re-seed carries the original clocks, so the server converges to exactly the state a device had, and two re-seeding devices converge with each other by the normal rule. The sync status pill shows "re-syncing after restore" while this runs.
- Alternative: forbid restore unless all devices are wiped. Unacceptable for a local-first product.
- Alternative: bump every re-emitted op to now. Would let a stale device overwrite newer data; rejected.

### D8. Data model impact
Additive: tables `settings`, `backup_runs` (migration `0002_backups.sql` or the next free number); a `generation` key in `settings`; `generation` field in the sync response; client `meta.generation`. No op field changes; no export format changes (export does not include backup settings or runs).

### D9. Dependencies and footprint
No new Go module. `archive/tar`, `compress/gzip`, `crypto/aes`, `crypto/cipher`, `crypto/hmac`, `crypto/sha256`, `net/http` from the standard library; argon2id from `golang.org/x/crypto` already present. Expected binary growth under 400 KB; image unchanged otherwise. Runtime memory: scheduler goroutine idle; during a run roughly 2–4 MB of buffers plus the argon2id derivation (19 MiB, transient). Client: one owner-only settings screen, under 6 KB gzipped.

### Implementation notes (as built)
- **Migration** is `0006_backups.sql` (number assigned at merge). The shared table is created as `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0)`, the same shape the `webhooks` change uses, so whichever lands first creates it. The migration also inserts the initial random `generation`. `backup_runs` gained a `kind` column (`manual|scheduled`) so manual runs do not shift the schedule.
- **Restore lock:** SQLite in WAL mode does not give an exclusive lock that an idle server would block, so the server now holds an advisory `flock` on `<data>/opentodo.lock` for its lifetime (`store.Lock`); `opentodo restore` takes the same lock, and additionally requires a truncating WAL checkpoint to succeed. This also stops two servers from sharing one data directory.
- **S3 payload:** the archive is built in `<data>/tmp` first and hashed, so `PutObject` carries a real `x-amz-content-sha256` and an exact `Content-Length` (no `UNSIGNED-PAYLOAD`, no chunked signing); memory stays constant.
- **Measured footprint:** server binary +0.6 MB stripped (11.51 → 12.12 MB, mostly `encoding/xml`, `archive/tar`, `compress/gzip` and AES-GCM), above the 400 KB estimate; client bundle +4.4 KB gzipped (128.3 → 132.7 KB). No new module.

## Risks / Trade-offs

- [`VACUUM INTO` blocks writers on a large database] → personal data volumes finish in well under a second; the run happens at a scheduled quiet time; the API `busy_timeout` of 5 s absorbs it.
- [Owner stores S3 keys on a device-level box that gets stolen] → secrets file is `0600`, excluded from archives, never returned by the API; the docs recommend a bucket-scoped key with write and list permissions only.
- [Encrypted backup with a forgotten passphrase is unrecoverable] → the UI says so when the passphrase is set and the status shows a lock icon; an unencrypted local copy can be kept in parallel by choosing the local destination.
- [Re-seed after restore floods the server with ops] → batches of 1,000 like normal sync; a re-seed of 5,000 tasks is about 55,000 ops, a few seconds on a Pi, once per device per restore.
- [Clock-skewed device re-seeds stale values with future timestamps] → the server already clamps timestamps more than five minutes ahead; re-emitted ops keep their original stored timestamps, which were already clamped when first stored.
- [Operator restores while the server runs] → the subcommand refuses when it cannot obtain an exclusive lock on the database file and documents the stop/start sequence; `docker compose` snippet provided.
- [Retention deletes the wrong objects at a shared prefix] → only objects matching the archive name pattern under the configured prefix are considered.

## Migration Plan

Additive migration; existing installs see no behaviour change until the owner enables a schedule. Rollback: an older image ignores `settings` and `backup_runs`; archives remain readable by any binary of the same or newer schema version.

## Open Questions

- Whether `backup.succeeded` / `backup.failed` should be the first server-level webhook events once `webhooks` lands (likely yes; the run record already holds the payload).
- Whether to offer a one-click "download latest backup" in Settings for the local destination (small addition; defer until asked).
