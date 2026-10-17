---
title: Backups
summary: Scheduled backups to a folder, S3 or WebDAV, encryption, retention, restore and the archive format.
audience: admin
specs: [backups, backup-restore]
screens: []
order: 30
---
# Backups

OpenTodo can back up its data directory on a schedule to a local directory, an
S3-compatible bucket or a WebDAV collection, keep a bounded number of archives,
optionally encrypt them with a passphrase, and restore them from the web app or
with nothing but the `opentodo` binary.

Nothing runs until the owner turns it on. Every setting is optional and managed
from **Settings → Server** (owner only); operators who prefer environment
variables can preset them (see [Environment presets](#environment-presets)).

- [Quick start](#quick-start)
- [Destinations](#destinations)
- [Schedule and retention](#schedule-and-retention)
- [Encryption and secrets](#encryption-and-secrets)
- [Restore](#restore): [from the web app](#restore-from-the-web-app) or [from the command line](#restore-from-the-command-line)
- [Environment presets](#environment-presets)
- [What a backup contains](#what-a-backup-contains) and the [encryption format](#encryption-format-otbk1)

## Quick start

1. Sign in as the owner and open **Settings → Server**. The top of the page
   shows the schedule, the next run and the last run with its outcome; below it
   are the destination, schedule, retention and encryption, then the recent runs.
2. Select **Change settings** and pick a destination. **Folder on the server** writes to `<data>/backups`
   (`/data/backups` in the container), which is inside the same volume: good
   against mistakes, not against losing the disk. For that, use S3 or WebDAV.
3. Choose a schedule (for example daily at 03:00, server time) and how many
   backups to keep (default 7).
4. Optionally set a passphrase to encrypt the archives.
5. **Save backup settings**, then **Test destination** and **Back up now**. The
   status shows the run in progress, then its outcome (**Succeeded** or
   **Failed**, with the error) and size. Each run is listed under **Recent runs**.

The same is available over the API ([docs/api.md](api.md#backups)).

## Destinations

The server contacts a destination only for a test or a backup run, and only the
destination the owner configured.

### Folder on the server

An absolute path, or empty for `<data>/backups`. Archives are written to a
temporary file in that folder and renamed into place, so an interrupted run
never leaves a half-written archive under a final name. Mount a second disk or
a network share there to get the copy off the data volume:

```yaml
services:
  opentodo:
    volumes:
      - opentodo-data:/data
      - /mnt/usb/opentodo-backups:/backups   # set the folder to /backups in Settings
```

The container runs as uid 65532; the folder must be writable by that user.

### S3-compatible storage

Works with AWS S3, Backblaze B2, Cloudflare R2, Wasabi, Scaleway, MinIO, Garage
and other S3-compatible services. Requests are signed with AWS Signature
Version 4; only `PutObject`, `ListObjectsV2`, `GetObject` (to restore from the
bucket) and `DeleteObject` are used, plus a multipart upload
(`CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`,
`AbortMultipartUpload`) for archives larger than 100 MiB, sent in 64 MiB parts.
A single upload is limited to 5 GB by S3; in parts, archives up to 640 GiB work.

| Setting | Example |
| --- | --- |
| Endpoint | `https://s3.eu-central-1.amazonaws.com`, `https://<account>.r2.cloudflarestorage.com`, `http://minio:9000` |
| Region | `eu-central-1` (default `us-east-1`; R2 uses `auto`) |
| Bucket | `my-opentodo-backups` |
| Prefix | `opentodo` (archives become `opentodo/opentodo-….tar.gz`) |
| Access key / secret key | a key limited to this bucket |
| Path-style | on for MinIO, Garage and most self-hosted stores; off for AWS (virtual-hosted `bucket.endpoint`) |

Give the key the least privilege it needs: `s3:PutObject`, `s3:GetObject`,
`s3:ListBucket`, `s3:DeleteObject` and `s3:AbortMultipartUpload` on the bucket
(delete is used by retention and by the destination test; abort cleans up the
parts of a failed large upload). A lifecycle rule that removes incomplete
multipart uploads after a day is a good safety net. Bucket versioning or object lock on the provider side adds
protection against a compromised server deleting its own backups.

### WebDAV

Nextcloud, ownCloud, Synology, a NAS, or any WebDAV server. Enter the URL of the
collection (folder) that should hold the archives, for example
`https://cloud.example.com/remote.php/dav/files/me/opentodo/`, plus a username
and password (on Nextcloud, create an app password). The collection is created
on the first run if it does not exist (its parent must). Plain `http://` URLs
are refused unless **Allow plain http** is ticked, because the password would
travel unencrypted.

## Schedule and retention

- **Frequency:** off (default), hourly (at the chosen minute), daily or weekly
  (at the chosen time and weekday), in the server's time zone (`TZ` of the
  process; the container defaults to UTC).
- **Missed runs:** if the server was stopped when a backup was due, one backup
  runs shortly after it starts again, then the schedule continues at the
  configured time. A failed run is recorded and the next attempt happens at the
  next scheduled time.
- **Manual runs** ("Back up now") do not move the schedule. Only one backup runs
  at a time; a second request gets a 409 `conflict`.
- **Retention** is applied at the destination after each successful run: the
  newest *keep last* archives (at least 1, default 7) are kept, and archives
  older than *delete older than* days are removed (0 = no age limit). The
  archive just written and the newest archive are never deleted. Only files
  whose names match `opentodo-YYYYMMDD-HHMMSS-xxxxxxxx.tar[.gz][.enc]` are ever
  considered, so other files under the same folder or prefix are safe.
- **History:** each run (time, outcome, size, duration, error) is recorded and
  shown in Settings for 90 days.

A run takes a snapshot of the database into `<data>/tmp`, packages it (in the
destination folder for a folder on the server, in `<data>/tmp` for S3 and
WebDAV), uploads it and deletes the temporary files, whether the run succeeded
or not. Before it starts, it checks the free disk space: the snapshot needs
about the size of the database, the archive about the database plus the
attachments (before compression), and 64 MiB are kept free on top. When the
disk is too full, the run fails at once with **not enough free disk space for a
backup** and the space it needs, instead of filling the disk the database
lives on. Temporary files left by a run that was interrupted (a crash, a power
cut) are removed when the server starts. When the server stops during a run,
the run is cancelled, recorded as failed, and the server waits for that before
it closes the database; the next scheduled run starts normally.
Uploads stream from disk; memory use stays at a few megabytes regardless of the
database size (plus about 19 MiB for a moment while the encryption key is
derived). There is no fixed time limit on an upload or a download: a request to
the destination fails only when nothing moved for 5 minutes, so a large archive
over a slow line is not cut off.

## Encryption and secrets

With a passphrase set, every archive is encrypted with AES-256-GCM under a key
derived from the passphrase with argon2id (format below). The manifest inside
records that the archive is encrypted and the file name ends in `.enc`.

- Changing the passphrase affects future backups only. Older archives still
  need the passphrase they were made with.
- **A forgotten passphrase cannot be recovered.** Store it in a password manager.
  If in doubt, keep an unencrypted local copy as well.
- The passphrase and the destination credentials are stored only in
  `<data>/secrets/backup.json` (mode 0600, directory 0700). They are never
  returned by the API (Settings shows only whether each one is set), never
  logged, and never included in an archive. Everything else (destination,
  schedule, retention) is stored in the database and is therefore part of the
  backup.

## Restore

Restoring replaces the whole database (every account, token, project, task and
the operation log) with the one in an archive. There are two ways, with the
same checks and the same result: from **Settings → Server** while the server
runs, or with `opentodo restore` while it is stopped.

### Restore from the web app

1. Open **Settings → Server** as the owner and scroll to **Restore from a
   backup**.
2. Choose the source:
   - **From the backup destination** lists the archives in the configured
     folder, S3 bucket or WebDAV collection, newest first, with their size and
     whether they are encrypted. Choose **Preview** on one.
   - **Upload a file** sends an archive from your computer, for example one
     made on another server. It is streamed to the data directory, never held
     in memory.
3. The server verifies the archive completely (the same checks as the command
   line, listed below) and shows a preview: when it was made, by which version,
   its size, and how many accounts, projects and tasks it holds. Nothing has
   changed yet. An encrypted archive made by this server opens with the stored
   passphrase; for one from another server you are asked for its passphrase.
4. Read **What will happen**, type `RESTORE` and choose **Restore and
   restart**. If you have not confirmed your identity in the last ten minutes,
   you are asked for your password (or a code) first.
5. The server stops gracefully, applies the restore before it reopens the
   database, and starts again in the same process: no container restart policy
   or shell is needed. The page shows **Restoring and restarting…** and reloads
   when the server is back, usually within seconds.

Sessions live in the database, so anyone who signed in after the backup was
taken (possibly you) signs in again; the sign-in screen says that the server
was restored. After a restart the restore section shows the outcome: when, from
which archive, and whether it worked. A restore that fails while it is applied
(for example a damaged staged file) leaves the previous database in place: the
server starts normally and the section, and the audit log, say why.

A prepared restore you do not confirm is discarded after 30 minutes, or at once
when you cancel. Confirming is refused while a backup is running; try again
when it has finished. The audit log records who asked for which archive, then
`backup.restored` or `backup.restore_failed`.

**Undo.** Every restore keeps the database it replaced as a safety copy.
While the safety copy of the last restore exists, **Undo last restore** puts it
back through the same preview, confirmation and restart. Undoing makes a new
safety copy of its own.

**Safety copies and disk space.** Safety copies are listed under the restore
section with their size and can be deleted (after a confirmation, and with a
fresh sign-in check) to free space. They are never deleted automatically. A
restore needs room for the archive, the extracted database and the safety copy,
roughly *archive size + 2 × database size* plus a 64 MiB margin; the server
checks first and refuses with the space it needs. Before extracting, it also
checks that the files the archive's manifest lists fit, and every file in the
archive must have exactly the size the manifest gives, so a damaged or
tampered archive cannot fill the disk.

**Reverse proxies.** Uploads go through your reverse proxy, and many limit
request bodies (nginx allows 1 MiB by default). If an upload is refused, raise
the limit for `/api/v1/backups/restore/uploads` (nginx:
`client_max_body_size 2g;`, Caddy needs nothing) or restore from the backup
destination instead, which needs no upload.

Restoring from the web app is owner-only, needs a signed-in session (API tokens
cannot do it) and is not available on a [demo instance](self-hosting/demo.md).

### Restore from the command line

The command line works with the server **stopped**, from the same binary:

```sh
opentodo restore [--data-dir DIR] [--passphrase-file FILE] <archive>
```

What both paths check, in order, before touching anything:

1. refuses to run while any server uses the data directory (it needs
   `<data>/opentodo.lock` exclusively, which every running server holds shared,
   plus a check that SQLite is idle);
2. decrypts the archive if needed (without `--passphrase-file` an encrypted
   archive is rejected, naming the missing passphrase);
3. checks the manifest, then the database's SHA-256 and size against it, and
   authenticates every encrypted chunk (a modified or truncated archive is an
   integrity error);
4. refuses an archive made by a newer schema version than the binary knows,
   naming both versions (upgrade the binary first);
5. runs SQLite's integrity check on the extracted database;
6. streams every attachment file into a temporary directory, checking its size
   and SHA-256 (a corrupt file stops the restore before anything changes).

Only then it saves the current database as
`opentodo.db.pre-restore-<YYYYMMDD-HHMMSS>` next to it, swaps in the restored
one, moves the attachment files into `<data>/attachments/` (files already there that the archive does not list are kept) and gives the database a new [log generation](sync.md#log-generation). Migrations
run on the next start, so an archive from an older version is upgraded
automatically.

#### With Docker Compose

```sh
docker compose stop opentodo

# The archive must be readable inside the container. For the default local
# destination it already is (/data/backups/...). For S3 or WebDAV, download it
# first and copy it into the volume, or mount it:
docker compose run --rm --no-deps \
  -v "$PWD/opentodo-20261010-030000-4f1c0a9e.tar.gz.enc:/restore/archive:ro" \
  -v "$PWD/passphrase.txt:/restore/passphrase:ro" \
  opentodo restore --passphrase-file /restore/passphrase /restore/archive

docker compose start opentodo
```

For an unencrypted archive leave out the passphrase mount and flag. The files
you mount must be readable by uid 65532. On Coolify the image has no shell for
the web terminal: stop the resource, run the restore on the host with
`docker run --rm -v <data volume>:/data -v <archive>:/restore/archive:ro
ghcr.io/pixari/opentodo restore /restore/archive`, then start the resource
again.

#### With the binary

```sh
systemctl stop opentodo        # or however you run it
OPENTODO_DATA_DIR=/var/lib/opentodo opentodo restore \
  --passphrase-file ~/opentodo-passphrase.txt \
  /var/lib/opentodo/backups/opentodo-20261010-030000-4f1c0a9e.tar.gz.enc
systemctl start opentodo
```

### After a restore: devices

The server went back in time, but your devices did not. Each device notices the
new log generation on its next sync, shows **Re-syncing after restore…** and
re-sends every field it holds with the field's original timestamp. Edits made
after the backup therefore come back, and when two devices disagree the newer
edit wins, exactly as in normal sync. No task is duplicated. Devices that are
offline do this when they reconnect. See [docs/sync.md](sync.md#log-generation).

This is a merge, not a rollback: a device that changed a task after the backup
sends that change back, so the restored server ends up with the backup plus
everything your devices did since. There is no mode that makes devices discard
their newer edits.

If something went wrong, use **Undo last restore**, or stop the server, move
`opentodo.db.pre-restore-…` back to `opentodo.db` and start it again.

## Environment presets

All optional. They seed the backup settings **once**, on a start where no backup
settings exist yet; after that, changes in Settings win and the variables are
ignored. An invalid value stops the server at startup with a message naming the
variable.

| Variable | Values |
| --- | --- |
| `OPENTODO_BACKUP_DESTINATION` | `local`, `s3`, `webdav` |
| `OPENTODO_BACKUP_LOCAL_DIR` | absolute path |
| `OPENTODO_BACKUP_S3_ENDPOINT`, `_S3_REGION`, `_S3_BUCKET`, `_S3_PREFIX`, `_S3_ACCESS_KEY`, `_S3_SECRET_KEY` | S3 settings |
| `OPENTODO_BACKUP_S3_PATH_STYLE` | `true` / `false` |
| `OPENTODO_BACKUP_WEBDAV_URL`, `_WEBDAV_USERNAME`, `_WEBDAV_PASSWORD` | WebDAV settings |
| `OPENTODO_BACKUP_WEBDAV_ALLOW_HTTP` | `true` / `false` |
| `OPENTODO_BACKUP_SCHEDULE` | `off`, `hourly`, `daily`, `weekly` |
| `OPENTODO_BACKUP_TIME` | `HH:MM` |
| `OPENTODO_BACKUP_WEEKDAY` | `0`–`6` (0 = Sunday) or a day name |
| `OPENTODO_BACKUP_KEEP` | at least 1 |
| `OPENTODO_BACKUP_MAX_AGE_DAYS` | 0 or more |
| `OPENTODO_BACKUP_COMPRESS` | `true` / `false` |
| `OPENTODO_BACKUP_PASSPHRASE` or `OPENTODO_BACKUP_PASSPHRASE_FILE` | passphrase, or a file containing it (Docker secrets) |

Secrets given this way are copied into `<data>/secrets/backup.json` on that
first start; remove them from the environment afterwards if you prefer.

## What a backup contains

A backup is one archive file:

```
opentodo-<YYYYMMDD-HHMMSS>-<generation8>.tar[.gz][.enc]
```

- `YYYYMMDD-HHMMSS` is the creation time in UTC, so names sort chronologically.
- `generation8` is the first 8 characters of the server's [log generation](sync.md#log-generation).
- `.gz` is present when compression is on (the default), `.enc` when a passphrase is set.

Inside is a `tar` stream with these entries, in this order:

1. `manifest.json`: what the archive holds.
2. `opentodo.db`: a transactionally consistent copy of the database.
3. `push_vapid.pem` (only when it exists): the web push key pair of [reminders](reminders.md).
   Restore puts it back next to the database, so devices that enabled notifications
   keep receiving them on the new host. Archives without it restore as before.
4. `attachments/<id[:2]>/<id>`: one entry per [attachment](attachments.md) file,
   each listed in the manifest with its size and SHA-256. Files are written once
   and never changed, so the entries match the database snapshot taken just
   before them.

**Size.** The archive grows by the attachment bytes; gzip gains little on
files that are already compressed (photos, PDFs). With *keep last* 7 the
destination holds up to seven copies of every file, so plan the space as
seven times (database plus attachments). Removed attachments stay in archives
until those archives expire, like the rest of the data.

The database copy is taken with SQLite's `VACUUM INTO` while the server keeps
running. It contains every account, session, API token, invitation, project,
task, label and the complete operation log as of one instant, and no WAL file
is needed to read it.

The archive never contains `<data>/secrets/` (destination credentials and the
passphrase) or `<data>/backups/` (earlier archives): only the database snapshot
the push key and the attachment files are packaged.

### `manifest.json`

```json
{
  "format": "opentodo-backup",
  "formatVersion": 1,
  "appVersion": "v0.9.0",
  "schemaVersion": 6,
  "createdAt": "2026-10-10T03:00:00Z",
  "generation": "4f1c0a9e2b7d4c55a1e0f3b2c8d9e7f6",
  "compression": "gzip",
  "encrypted": true,
  "files": [
    { "name": "opentodo.db", "size": 1048576, "sha256": "<hex>" },
    { "name": "attachments/9f/9f2c41d0-…", "size": 48213, "sha256": "<hex>" }
  ]
}
```

`schemaVersion` is the database's `PRAGMA user_version`; a binary refuses to
restore an archive whose schema is newer than the one it knows. `sha256` and
`size` are verified on restore.

### Layers

Writing an archive is `tar → gzip (optional) → encryption (optional) → file`.
Reading it peels the layers in reverse: an encrypted archive starts with the
five bytes `OTBK1`, a gzip stream with `1f 8b`, anything else is read as plain
`tar`. An unencrypted archive can be inspected with standard tools:

```sh
tar -xzf opentodo-20261010-030000-4f1c0a9e.tar.gz   # manifest.json + opentodo.db
```

## Encryption format (`OTBK1`)

When a passphrase is set, the compressed tar stream is encrypted with
AES-256-GCM in 1 MiB chunks under a key derived with argon2id. All integers are
big-endian.

| Offset | Size | Field |
| ------ | ---- | ----- |
| 0 | 5 | magic, ASCII `OTBK1` (the `1` is the format version) |
| 5 | 1 | key derivation id: `0x01` = argon2id |
| 6 | 4 | argon2id memory in KiB (`19456` = 19 MiB) |
| 10 | 4 | argon2id iterations (`2`) |
| 14 | 1 | argon2id parallelism (`1`) |
| 15 | 16 | random salt |
| 31 | 4 | plaintext chunk size in bytes (`1048576`) |
| 35 | … | chunks |

- **Key:** `argon2id(passphrase as UTF-8, salt, iterations, memory, parallelism)`, 32 bytes. The parameters are the same as the account password hasher.
- **Chunks:** the plaintext is cut into chunks of exactly *chunk size* bytes; the last chunk holds the remaining 0 … *chunk size* bytes (an empty stream still has one, empty, final chunk). Each chunk is written as `AES-256-GCM-Seal(key, nonce, plaintext, aad)`, i.e. the ciphertext followed by the 16-byte tag, so a full chunk occupies *chunk size* + 16 bytes on disk.
- **Nonce (12 bytes):** bytes 0–7 are the chunk index starting at 0; bytes 8–10 are zero; byte 11 is `0x01` for the final chunk and `0x00` otherwise. The key is unique per archive (fresh salt), so nonces never repeat under one key.
- **Associated data:** the 35 header bytes, so the parameters and salt cannot be altered.

A reader takes *chunk size* + 16 bytes at a time; the chunk that ends the file
is opened with the final flag. This detects every kind of damage:

- a modified byte fails that chunk's tag;
- reordered chunks fail because the index is in the nonce;
- a file cut at a chunk boundary fails because that chunk was sealed as non-final;
- bytes appended after the final chunk are rejected.

A wrong passphrase fails on the first chunk. Changing the passphrase affects
future backups only; keep the old passphrase for as long as you keep archives
made with it. **A forgotten passphrase cannot be recovered**: OpenTodo stores
no copy outside `<data>/secrets/backup.json`, and that file is not in the archive.

The same code path is used by `opentodo restore`, so no external tool is needed.
`internal/backup/crypt_test.go` contains an independent reference decryptor
written from this description (`TestFormatMatchesDocumentedLayout`).
