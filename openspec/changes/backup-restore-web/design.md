# Design

## Context

See proposal.md (Why). The relevant code today:

- **`backup.Restore`** (`internal/backup/restore.go`) does everything in one pass:
  - takes the exclusive `store.Lock` and refuses while a server holds it;
  - double-checks the WAL is idle (`checkNotInUse`);
  - streams the archive (decrypting when needed) into `<data>/tmp/restore-*.db` while hashing, then verifies size and SHA-256 against the manifest;
  - runs `PRAGMA integrity_check`, checks `user_version` against the manifest, writes a fresh generation plus a `backup_restored_pending` marker into the extracted DB, and marks interrupted `backup_runs` as failed;
  - `VACUUM INTO`s the live DB to `opentodo.db.pre-restore-<ts>`, removes `-wal`/`-shm`, renames the temp DB into place and writes the extra files (`secrets.json` etc.) atomically.
- **On the next start**, `Service.recordPendingRestore` turns the marker into the `backup.restored` audit event.
- **The server** (`cmd/opentodo/main.go`) holds `store.LockShared` for its whole life, so a newer server can start beside it during a rolling update. It opens one `*sql.DB` that more than 15 services share (auth, sync, push, webhooks, caldav, backup scheduler and others), and stops through `srv.Shutdown` after SIGTERM.
- **Destinations** implement `Put`, `List` and `Delete` only (`internal/backup/dest.go`), so an archive in S3 or WebDAV can't be read back today.
- **Devices** already handle a restore. Every sync response carries `generation`. On a mismatch the client re-emits every local field with its stored clock, keeps its outbox, resets the cursor and re-pulls (`web/src/lib/sync.ts:232-300`, `docs/sync.md#log-generation`).
- **Owner-only backup routes** go through `requireBackupOwner`. Sensitive actions use `requireFresh` (`internal/httpapi/mfa.go:57`), which answers `reauth_required` and makes the web app open `ReauthDialog`. The demo deny list already refuses everything under `/api/v1/backups` (`internal/httpapi/demo.go:135`).
- **The shipped `docker-compose.yml`** uses `restart: unless-stopped`. Bare-binary and systemd installs may not restart on exit.

## Goals / Non-Goals

**Goals:**
- One verification and swap procedure shared by the CLI and the web, so the guarantees are identical.
- Nothing about the live database changes until the owner has seen a verified preview and confirmed.
- The flow works on a single container (Coolify, Raspberry Pi) without shell access and without relying on a restart policy.
- Memory stays constant regardless of archive size, and disk needs are checked before any work starts.

**Non-Goals:**
- Hot-swapping the database under a running server, for the reasons below.
- Partial or selective restore, or a "discard device edits" rollback mode (proposal: out of scope).
- Any change to the sync protocol or op format.

## Decisions

### 1. Staged restore applied at startup, triggered by an in-place restart

**Flow:**

```
 prepare (server running)                  confirm                      restart in place
 ---------------------------------------   --------------------------   -------------------------------
 source -> <data>/tmp/restore/<id>/        reauth + "RESTORE"           srv.Shutdown, close DB,
   archive (streamed: upload or dest Get)  write restore-pending.json   release shared lock
 verify: manifest, decrypt, sha256,        audit: restore requested     re-exec same binary
   integrity, schema  -> extracted.db      202 to the browser           startup: pending marker?
 preview counts (read-only open)                                          -> exclusive lock
                                                                          -> apply (safety copy, swap,
                                                                             generation, extras)
                                                                          -> shared lock, normal start
```

**How it works:**
- `Restore` is split into three steps, and the CLI simply calls all three in a row, so its behavior is unchanged:
  - `Stage(archive reader, passphrase) -> Staged{dir, manifest, extracted DB path, extras}`: streams, decrypts, hashes, checks integrity and schema.
  - `Preview(Staged) -> counts`
  - `Apply(dataDir, Staged)`: lock, `checkNotInUse`, generation and marker, safety copy, swap, extras.
- **Confirm** writes `<data>/restore-pending.json` (staged id, archive name, actor id, requested-at) atomically, answers 202, then cancels the server's root context. That runs the existing graceful shutdown, including draining the webhook worker and closing live-update streams.
- **After `run()` returns**, `main` checks for an "exec requested" flag and calls `syscall.Exec(os.Executable(), os.Args, os.Environ())`. The PID stays the same, so a container whose PID 1 is `opentodo` never exits and no restart policy is involved.
- **Early in `run()`**, before `store.LockShared` and `store.Open`, `backup.ApplyPendingRestore(dataDir)` takes the exclusive lock, applies the staged restore, and removes the marker and staging dir.
  - The outcome is always written to the sidecar `restore-last.json`: time, archive, actor, success or error, and the safety copy's name. The restore section reads it, and "Undo" is offered while that safety copy exists.
  - On success, the restored DB's `settings` also carries the `backup_restored_pending` marker, as JSON with the actor, and `recordPendingRestore` emits `backup.restored`.
  - Startup then continues normally.
- **Audit order.** The audit log lives in the database being replaced, so `backup.restore_requested` (and `backup.restore_failed`) are recorded from `restore-last.json` on the start that applied the restore, not at confirm time. The trail therefore survives the swap: request first, then outcome.

**Alternatives considered:**
- **Hot swap in-process** (quiesce handlers, close and reopen `*sql.DB`): rejected. Every service holds the `*sql.DB` directly, and several cache state from it (sessions, settings, sync notifier, schedulers). A safe swap would mean an indirection layer plus a restart of every goroutine, which is a large, error-prone refactor for a rare operation. A process restart gives the same result with code that already exists and is tested.
- **Exit and rely on the restart policy**: rejected as the primary mechanism. Bare-binary and systemd installs without `Restart=` would stay down. It remains the fallback: when `syscall.Exec` is unavailable (Windows) or fails, the process exits 0 after logging "restart OpenTodo to finish the restore". The marker makes the next start apply it either way.
- **Apply on the next manual restart only**: rejected, because it brings back the shell access this change exists to remove.

**Why the marker approach is robust:** if the process dies at any point after the marker is written, the next start applies or reports the restore. Before the marker is written, nothing has changed.

### 2. A second server holding the data directory blocks the apply, not the start

`applyPendingRestore` needs the exclusive lock. When a rolling update has a second process holding the shared lock, the apply fails with `store.ErrLocked`. The server then starts normally on the old database, records the failure ("another OpenTodo process is using the data directory") and keeps the staged files for 30 minutes so the owner can retry. Waiting or spinning on the lock was rejected because it could block startup indefinitely.

### 3. Sources: destination read-back and streaming upload

- **`Destination` gains `Open(ctx, name) (io.ReadCloser, int64, error)`**, accepting only names that match `archiveNameRE`:
  - local: `os.Open`
  - S3: signed GET through the existing `sigv4.go`
  - WebDAV: GET with basic auth.
- The archive is streamed to `<data>/tmp/restore/<id>/archive` and then staged from the file. Staging straight from the network stream was rejected because a dropped connection halfway through decryption would leave a half-verified state. Re-reading a local file is cheap and makes retries with another passphrase free.
- **Upload** is `application/octet-stream` (no multipart parsing) through `http.MaxBytesReader`. The cap is the free space on the data directory's filesystem minus 2 × the current DB size plus a 64 MiB margin. Free space comes from `syscall.Statfs`, with a no-cap fallback when unavailable.
- Reverse proxies with small body limits (nginx's default 1 MiB) will reject uploads before they reach us. The UI turns a 413 from the proxy into "Your reverse proxy refused the upload; raise its body size limit or restore from the backup destination instead", and the docs say so too. The destination path avoids the issue entirely.

### 4. Passphrase handling

- `prepare` tries the passphrase in the request, otherwise the one stored in backup secrets (`Service` already reads it for writing).
- `openArchive` already returns `ErrPassphraseRequired` for an encrypted archive without a passphrase, which maps to `passphrase_required`. A wrong passphrase currently surfaces as `ErrIntegrity`, because the first chunk fails AEAD authentication. This change adds `ErrPassphraseInvalid`, returned when the *first* chunk fails to open, so a wrong passphrase (`passphrase_invalid`) is told apart from later corruption (`integrity`).
  - `ErrPassphraseInvalid` wraps `ErrIntegrity`, so the CLI and its tests are unchanged.
  - `openArchive` opens the first chunk up front, so the error is not hidden behind the gzip or tar layer.
  - With the default 1 MiB chunks, a small archive is a single chunk. Damage anywhere in it therefore reads as `passphrase_invalid`. The two can't be told apart without a key-check value in the format, which this change does not add.
- Passphrases are never stored with the staged files and never logged.
- `prepare` gets the same per-IP rate limiter that `reauth` uses, to slow brute-forcing of a stolen archive's passphrase through the server.

### 5. Preview counts

`Preview` opens the extracted DB read-only (`mode=ro`) and counts `users` and `ops`, plus live projects and tasks. There are no `projects` or `tasks` tables: entities are materialized field by field, in `fields` (schema 0001 to 0007) and `scope_fields` (since project sharing). An entity counts as live when it has no `deleted_at` field or that field is `null`. The preview runs no migrations: the counts come from the archive's own schema. A test pins this against a schema-0001 database and the current schema.

### 6. Staging lifecycle and identifiers

- Staged ids are 128-bit random hex.
- Each staged id has a directory `<data>/tmp/restore/<id>/` containing `archive`, `extracted.db` and `meta.json` (source, manifest, created-at, owner id).
- An in-process sweeper runs every 5 minutes and removes directories older than 30 minutes, skipping the one named by `restore-pending.json`. Startup removes every staging dir except the pending one.
- Only one prepared restore exists at a time: preparing a new one cancels the previous. Concurrent tabs can't stack gigabytes of staged data that way.

### 7. Undo and safety copies

- The newest `opentodo.db.pre-restore-<ts>` is a plain SQLite file, so undo stages it as a source of kind `safety-copy`. It skips the archive step but still runs the integrity and schema checks into a fresh `extracted.db` copy, then goes through the same confirm, restart and `Apply`, which makes a new safety copy and a new generation.
- Safety copies are listed by globbing the data directory. `DELETE /api/v1/backups/restore/safety-copies/{name}` validates the name against `^opentodo\.db\.pre-restore-\d{8}-\d{6}$`.
- **Automatic pruning is deliberately not added.** Silently deleting a recovery point is the wrong default for a feature that exists to recover data. The UI shows the total size instead.

### 8. HTTP surface

All routes are registered with `requireAuth` and gated by `requireBackupOwner`. The confirm and safety-copy delete routes apply the freshness check after the owner check, so a member gets `forbidden` rather than a re-authentication prompt. The demo deny list covers the existing `/api/v1/backups` prefix for writes only. `/api/v1/backups/archives` (which contacts the destination) and everything under `/api/v1/backups/restore` are therefore denied for every method. Upload and prepare lift the server's 60 s read and write deadlines for their own connection, because a large archive takes longer.

| Method and path | Fresh | Purpose |
|---|---|---|
| `GET /api/v1/backups/archives` | no | List archives in the destination |
| `POST /api/v1/backups/restore/uploads` | no | Stream an archive in, 201 `{id, manifest}` |
| `POST /api/v1/backups/restore/prepare` | no | `{source: {archive}|{upload}|{safetyCopy}, passphrase?}` returns a preview |
| `DELETE /api/v1/backups/restore/{id}` | no | Cancel a staged restore |
| `POST /api/v1/backups/restore` | yes | `{id, confirm: "RESTORE"}`, 202 then restart |
| `GET /api/v1/backups/restore` | no | Staged restore, last restore outcome, safety copies, free space |
| `DELETE /api/v1/backups/restore/safety-copies/{name}` | yes | Delete a safety copy |

Bearer tokens pass `requireFresh` by design (see its comment). Because restore is destructive, `POST /api/v1/backups/restore` and the safety-copy delete additionally refuse bearer tokens with 403 `session_required`, so only an interactive owner session can trigger them. Read-scope tokens are already refused on writes.

### 9. Client flow

The restore section is added to `BackupsPanelView` using the existing primitives (`.btn-*`, `.input`, overlay `Dialog`). It adopts `ui-primitives` components once those land; this change doesn't depend on them.

```
 [ Restore from backup ]
   Source:  (o) From destination   ( ) Upload a file
   +-------------------------------------------------------------+
   | 2026-10-13 03:00   18.2 MB   encrypted          [Preview]    |
   | 2026-10-12 03:00   18.1 MB   encrypted          [Preview]    |
   +-------------------------------------------------------------+
   Preview -> dialog: date, versions, accounts/projects/tasks, size,
              "what will happen" list, passphrase field if needed,
              type RESTORE, [Restore and restart]  (reauth on 403)
   Restarting -> full-screen status, polls GET /healthz every 1s
              (60s budget, then "still restarting, check the server log")
   Back      -> location.reload(); a 401 lands on sign-in with a
              "restored from a backup" note (flag in sessionStorage)
   Last restore: time, archive, outcome   [Undo last restore]
   Safety copies: list with size          [Delete]
```

Upload uses `fetch` with a `ReadableStream` body only where supported. Otherwise it sends the `File` directly, which browsers stream anyway, and shows progress through `XMLHttpRequest.upload.onprogress`.

### Data model impact

- No new tables, columns or op fields.
- New files in the data directory: `restore-pending.json`, `restore-last.json`, and `tmp/restore/<id>/`. Existing `settings` keys are reused (`backup_restored_pending`, the generation key).
- Two new audit event names are added additively in `internal/audit/events.go`: `backup.restore_requested` and `backup.restore_failed`, the latter with the Failure outcome. Undo uses `backup.restore_requested` with `source=safety-copy`. Deleting a safety copy gets `backup.safety_copy_deleted`.

### Size and resource impact

- **Container image and binary:** no dependencies. Measured with the same embedded web assets and `-s -w`: 23,466,146 → 23,617,698 bytes, **+148 KiB (+0.6%)**. That is more than the "few KB" first estimated: staging, the startup apply, three destination readers and the HTTP handlers add about 1,500 lines of Go.
- **Web bundle:** measured with `vite build`, every JS and CSS asset gzipped at level 9: 588,303 → 592,856 bytes, **+4.4 KiB**, including the longer in-app help text. The restore section and the `lib/restore.ts` helpers ship in the settings code.
- **Runtime memory:** constant (64 KiB copy buffers, streaming decrypt), plus about 19 MiB for the Argon2id key derivation of an encrypted archive (the same cost as a password check). The preview opens a second SQLite connection briefly.
- **Disk at peak:** archive + extracted DB + safety copy, roughly archive size + 2 × DB size, checked up front.
- **Downtime:** graceful shutdown (up to 10 s, plus up to 15 s for webhook delivery) + apply (`VACUUM INTO` of the current DB plus a rename, seconds for typical sizes) + startup.

## Risks / Trade-offs

- **[Owner expects a true rollback, but online devices push post-backup edits back]** → The preview's "what will happen" list says so in plain words, and `docs/backups.md` explains it. A rollback mode is a possible follow-up, which would need a protocol flag.
- **[Re-exec under an unusual supervisor (`s6`, `tini` with odd signal setups)]** → Exec replaces the process image in place and is transparent to supervisors. If exec fails, exiting cleanly with the marker on disk still finishes the job on the next start.
- **[A reverse proxy caps upload size]** → The destination source needs no upload, and a 413 gets clear copy.
- **[The decrypted DB sits in `tmp/` for up to 30 minutes]** → It's in the same directory and has the same mode (0600) as the live database, so it's no new exposure. It's removed on cancel, expiry and startup.
- **[Disk fills mid-apply]** → Free space is checked before staging and again before `VACUUM INTO`. `Apply` swaps by rename, so a failure before the rename leaves the live DB untouched.
- **[The owner's own session disappears after the restore]** → This is expected, because sessions live in the DB. The sign-in screen explains why.
- **[A second instance holds the shared lock]** → Decision 2: start on the old DB, report it, and allow a retry.

## Migration Plan

- This is additive. Old clients ignore the new routes, and the CLI is unchanged.
- No migration runs. On first start the new code removes any orphaned `tmp/restore/*`.
- **Rollback of the feature:** deploying an older binary leaves at most an unused `restore-pending.json` or `restore-last.json` in the data directory, which older versions ignore. To be safe, a pending marker from a newer binary is applied only by binaries that know the format: `meta.json` carries `formatVersion: 1`.
