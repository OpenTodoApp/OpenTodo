# Backups

OpenTodo can back up its data directory on a schedule to a local directory, an
S3-compatible bucket or a WebDAV collection, keep a bounded number of archives,
optionally encrypt them with a passphrase, and restore them with nothing but the
`opentodo` binary.

Nothing runs until the owner turns it on. Every setting is optional and managed
from **Settings → Backups** (owner only); operators who prefer environment
variables can preset them (see [Environment presets](#environment-presets)).

## What a backup contains

A backup is one archive file:

```
opentodo-<YYYYMMDD-HHMMSS>-<generation8>.tar[.gz][.enc]
```

- `YYYYMMDD-HHMMSS` is the creation time in UTC, so names sort chronologically.
- `generation8` is the first 8 characters of the server's [log generation](sync.md#log-generation).
- `.gz` is present when compression is on (the default), `.enc` when a passphrase is set.

Inside is a `tar` stream with exactly two entries, in this order:

1. `manifest.json`: what the archive holds.
2. `opentodo.db`: a transactionally consistent copy of the database.

The database copy is taken with SQLite's `VACUUM INTO` while the server keeps
running. It contains every account, session, API token, invitation, project,
task, label and the complete operation log as of one instant, and no WAL file
is needed to read it.

The archive never contains `<data>/secrets/` (destination credentials and the
passphrase) or `<data>/backups/` (earlier archives): only the database snapshot
is packaged.

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
    { "name": "opentodo.db", "size": 1048576, "sha256": "<hex>" }
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
