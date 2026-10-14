# Proposal

## Why

The owner can make backups from Settings → Backups, but restoring one is only possible from the command line: stop the server, run `opentodo restore <archive>`, start it again (`docs/backups.md#restore`). On Coolify or a Raspberry Pi behind a web panel, that means stopping the resource, mounting the data volume into a one-off container and finding the archive on the host by hand. Most self-hosters will first try to restore in the middle of an incident, and that is the worst moment for this procedure. A backup you cannot easily restore is only half a feature, so this change gives the owner a guided restore in the web app with the same safety guarantees as the CLI.

## What Changes

- **List restorable archives.** Settings → Backups lists the archives in the configured destination (local folder, S3 or WebDAV): date, size, whether encrypted, and app version when known.
- **Upload an archive.** The owner can also upload an archive file from their computer, for example one taken from another server or downloaded by hand. It is streamed to the data directory, never held in memory, and refused when disk space is short.
- **Verify and preview before anything changes.** The server fully verifies the chosen archive with the same checks as `opentodo restore`: manifest, checksum, decryption, schema version and SQLite integrity. It then shows a preview: backup date, app and schema version, number of accounts, projects and tasks, and archive size. Encrypted archives from this server use the stored backup passphrase automatically; others ask for one.
- **Explicit confirmation.** Restoring needs a recent re-authentication (the existing reauth flow) and typing a confirmation word. The screen states plainly what happens:
  - The server restarts, causing a brief interruption.
  - Accounts, passwords, sessions and tokens go back to the state in the backup, so anyone whose session started after the backup, possibly including the owner, signs in again.
  - Devices re-sync, and devices that changed data after the backup send those newer changes back.
- **Safe swap through a self-restart.** The server records the staged restore, shuts down gracefully, applies the restore before it reopens the database (keeping the existing `opentodo.db.pre-restore-<ts>` safety copy and fresh log generation), and starts again in the same process. No container restart policy or shell access is needed.
- **Undo the last restore.** While its safety copy exists, the owner can put the previous database back through the same flow. Safety copies are listed with their size and can be deleted to free space.
- **Status and audit.** The screen follows the restart and reloads when the server is back. The audit log records who requested the restore, from which archive, and the outcome. A failed apply leaves the previous database in place and is reported on the next visit.
- The CLI `opentodo restore` keeps working unchanged. Restore stays owner-only and is refused on the public demo instance (the existing `/api/v1/backups` deny prefix).

Not **BREAKING**: there are no new environment variables, and the op log and sync protocol are unchanged (restores already change the log generation).

**Out of scope:**
- A "rollback" mode that makes devices throw away their newer local edits. Restores keep today's merge semantics: post-backup edits on devices win by last-writer-wins.
- Restoring a single project, task or account from an archive.
- Restoring on a multi-instance deployment while a second server holds the data directory (refused with a clear error).
- Restore by non-owner admins, and API-token-driven restore without a session.
- Visual redesign of the Backups panel beyond the new restore section. The settings and design-system changes cover that.

**ROADMAP.md:** advances the `backups` item (Scheduled backups to local disk, S3 or WebDAV) by closing its restore gap in the UI.

## Capabilities

### New Capabilities
- `backup-restore`: Owner-driven restore from the web app. Covers listing and uploading archives, verifying and previewing them, confirmation, the self-restart apply, undoing the last restore, safety-copy management, and restore status.

### Modified Capabilities
- `backups`: The "Restore procedure" requirement changes. It is no longer CLI-only, and both paths share one verification and swap procedure. The `Destination` contract gains reading archives back, which is needed to restore from S3 or WebDAV without downloading by hand.

## Impact

- **Backend:**
  - `internal/backup`: a read method on destinations (local, S3 via the existing SigV4 signer, WebDAV), staging and verification split out of `Restore`, a preview read of counts, staged-restore marker handling, safety-copy listing and deletion, and an undo source.
  - `cmd/opentodo/main.go`: apply a staged restore before `store.Open`, then restart the process in place after a graceful shutdown.
  - `internal/httpapi/backups.go`: new owner-only routes under `/api/v1/backups/restore…` and `/api/v1/backups/archives`, using `requireAuth`, the owner check and `requireFresh`.
  - `internal/audit`: restore-requested and restore-failed events next to the existing `backup.restored`.
- **Frontend:** a restore section in `web/src/app/BackupsPanel.tsx` (source list, upload, passphrase, preview, confirmation, restart progress), API helpers in `web/src/lib/api.ts`, and tests.
- **Docs:** `docs/backups.md` (web restore, undo, what devices do), `docs/api.md` (new routes), and the in-app help for `settings/backups`.
- **Dependencies:** none. The Go binary grows by a few KB and the web bundle by roughly 4–6 KB gzipped.
- **Disk:** a restore temporarily needs about archive size + 2 × database size: the staged archive, the extracted database and the safety copy. The server checks free space first and refuses with a clear message. Memory use stays constant because everything is streamed.
