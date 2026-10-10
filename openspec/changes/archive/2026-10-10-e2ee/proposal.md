# Proposal

## Why

Self-hosting already keeps task data off third-party servers, but the server itself, its backups, and whoever can read the disk still see every title and note. Some users run OpenTodo on a rented machine or a shared home server and want the strongest promise a sync service can make: the server stores what it cannot read. Because every change already travels as a field-level operation whose value the server treats as opaque, OpenTodo can offer end-to-end encryption of task content without changing the sync protocol, as an optional, per-account choice with a clear statement of what it does and does not hide.

## What Changes

- A new `end-to-end-encryption` capability, off by default and enabled per account from Settings. The client generates a random account key, wraps it with a key derived from a passphrase and with a random recovery key, and stores only the wrapped keys on the server.
- Content fields are encrypted on the device before they become operations and decrypted after operations arrive: task `title`, `description` and each `labels` entry, and project `name`. Scheduling and structural fields stay in plaintext so sorting, views and future reminders keep working: `due`, `priority`, `completed_at`, `deleted_at`, `created_at`, `position`, `project_id`, `parent_id`, project `color` and `archived`.
- Ciphertext travels through the unchanged op log as strings with a recognisable prefix; the server validates, stores and serves it exactly like any other value, and field-level last-writer-wins converges on ciphertext.
- New devices are enrolled by entering the passphrase after sign-in and before the first sync; the key is then kept locally so the device works offline. Passphrase change re-wraps the key; the recovery key resets a forgotten passphrase; losing both means the content is unrecoverable, and the user must acknowledge that.
- Enabling on an account with existing data re-writes every content field as ciphertext through ordinary operations with a progress indicator; plaintext content that appears later (for example written through the REST API) is encrypted by the next unlocked device that syncs it; an explicit action purges superseded plaintext operations from the server's history. Disabling reverses the process.
- Consequences are stated and surfaced: REST reads, exports, and server-side integrations (CalDAV, email-to-task, MCP, webhooks when they exist) see ciphertext for encrypted accounts; project sharing is unavailable for encrypted accounts until sharing has per-project keys.
- New authenticated routes: `GET/PUT/DELETE /api/v1/encryption/keys` and `POST /api/v1/encryption/purge-history`; the profile response gains an `encryption` field.

Out of scope: encrypting metadata (dates, structure, counts, timing), encrypting attachments or comments (none exist yet; they will follow the same field rule), sharing encrypted projects between accounts, server-side search over encrypted content, an owner policy forcing encryption, hardware-key or passkey-derived encryption keys, and protection against a malicious server serving tampered client code (documented limitation of web-delivered end-to-end encryption; a later change can add release verification).

This change advances ROADMAP.md section 7, "Optional end-to-end encryption of task content", and constrains `reminders`, `caldav`, `email-to-task`, `mcp-server`, `webhooks` and `project-sharing`, which must treat content fields of encrypted accounts as opaque.

No new mandatory environment variable. No change to the op-log format: the op schema, field names, value types and sync endpoint are untouched; ciphertext is a valid string value for the existing string fields. Not **BREAKING**; older clients syncing an encrypted account would display ciphertext, which the migration section addresses by versioning the client's minimum supported app version in the profile response.

## Capabilities

### New Capabilities
- `end-to-end-encryption`: enablement and key material, the encrypted and plaintext field split, transport through the op log, convergence on ciphertext, device enrolment and locking, recovery and passphrase change, migration of existing data and history purge, and the consequences for server-side reads.

### Modified Capabilities
- none. `offline-first-sync` requirements hold unchanged: operations are still one field, one value, LWW by `(ts, device)`. `http-api` and `task-management` keep their contracts; the values they carry are ciphertext for encrypted accounts, which this capability specifies.

## Impact

- Server: `encryption_keys` table (additive migration), four handler registrations, one `encryption` field on the profile, a history purge that deletes superseded operations of content fields for one account, and documentation of the plaintext/ciphertext split. No cryptography runs on the server.
- Web app: `web/src/lib/crypto.ts` using the browser's built-in cryptography (key derivation, key wrapping, authenticated encryption), encryption in `mutate()` and decryption in `applyOps`, a locked state in the sync engine, enrolment and unlock screens, Settings panel for enabling, passphrase change, recovery key, re-encryption progress, purge and disable.
- Docs: `docs/encryption.md` (new: threat model, what is and is not protected, recovery), `docs/sync.md` (ciphertext values), `docs/api.md`, `SECURITY.md`, `README.md`.
- Dependencies: none on either side. Binary size unchanged within noise; bundle +~8 KB gzipped; runtime memory on the client grows by the decrypted working set it already holds today.
