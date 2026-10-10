# Proposal

## Why

"Back up one folder" is true today only if someone remembers to do it. A self-hosted task manager on a Raspberry Pi or a small VPS loses years of tasks to one failed SD card, and copying a live SQLite file in WAL mode is not guaranteed to be consistent. Data ownership includes surviving hardware failure without a vendor; backups must therefore be built in, scheduled, verifiable, and restorable with nothing but the binary and the backup file.

## What Changes

- Scheduled backups of the data directory: a consistent snapshot of the database plus a manifest, packaged as one archive, written to a local directory (default `<data>/backups`), an S3-compatible bucket or a WebDAV collection.
- Optional encryption at rest with a passphrase; the format is documented so a restore needs only the binary and the passphrase.
- Retention (keep the last N backups and, optionally, N days) applied at the destination after each successful run; "Back up now" and "Test destination" actions; status (last run, outcome, size, next run, recent history) visible in Settings and through the API.
- All configuration optional and owner-managed from the UI; destination credentials and the encryption passphrase are stored only in a secrets file under the data directory, which is excluded from the archive so a backup never contains the keys to itself.
- A documented restore procedure through an `opentodo restore` subcommand that verifies the archive, keeps a safety copy of the current database and replaces it while the server is stopped.
- Convergence after restore: the server advertises a log generation; devices that notice a change re-pull from the beginning and re-seed the server from their local copy (the client is the source of truth), so edits made after the backup are not lost merely because the server went back in time.

Out of scope: backing up anything other than the data directory (reverse-proxy config, container images); point-in-time recovery of individual tasks (`trash-and-history`); restoring from the UI while the server runs; backups of a single user's data (the export already covers that); push notifications on failure (`reminders` or a webhook event in a later change); destinations other than local, S3-compatible and WebDAV.

Advances ROADMAP.md section 6, "Scheduled backups to local disk, S3 or WebDAV" (`backups`).

No breaking changes: no new mandatory environment variable (optional `OPENTODO_BACKUP_*` variables mirror the UI settings for operators who prefer them), no change to existing op fields. The sync response gains one additive field (`generation`); clients that ignore it keep working.

## Capabilities

### New Capabilities
- `backups`: snapshot consistency, destinations, schedule and retention, encryption, secrets handling, status and management routes, restore, and device convergence after restore.

### Modified Capabilities
- `self-hosting`: the "No telemetry" requirement is clarified so that outbound requests go only to destinations the owner or a user configured (backup targets here; webhook endpoints in the `webhooks` change, which carries the identical clarification). The first archived change wins; the second is a no-op.

## Impact

- Server: new `internal/backup` package (snapshot, archive, encryption, destinations, scheduler, retention, restore), owner-only routes under `/api/v1/backups/*`, a `settings` key-value table and a `backup_runs` table in a new migration, the `restore` subcommand, the `generation` field in `/api/v1/sync` responses. No new Go dependency: S3 request signing and WebDAV are implemented over `net/http`, encryption uses the standard library plus the already present `golang.org/x/crypto` for key derivation.
- Client: Settings → Backups screen (owner only), sync engine handles `generation`.
- Docs: `docs/backups.md` (destinations, encryption format, restore procedure, retention), `docs/self-hosting/*` cross-links, `docs/sync.md` (generation), `docs/api.md`.
