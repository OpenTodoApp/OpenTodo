# Design

## Context

The sync primitive is a field-level operation `{id, entity, entityId, field, value, ts, device}` whose value the server validates by type and otherwise stores opaquely; winners are chosen by `(ts, device)`, never by value. The client applies every edit locally through `mutate()` and receives remote changes through `applyOps`. That gives end-to-end encryption two natural hook points and no need to touch the protocol. The constraints: no new dependencies if the browser can do the cryptography, the server must stay unable to read content, offline use must remain complete, convergence must be untouched, and the limits must be honest.

## Goals / Non-Goals

**Goals:**
- Server, backups and server-side integrations never hold plaintext content for an account that enabled encryption.
- Protocol, op schema and server validation unchanged; convergence proofs unchanged.
- Fully offline once a device is unlocked; new devices enrol with the passphrase; recovery without the server.
- Honest boundary: documented list of plaintext fields and a documented threat model.

**Non-Goals:**
- Hiding metadata (dates, structure, counts, timing), sharing encrypted projects, server-side search, forced encryption by the owner, defence against a malicious server shipping tampered client code.

## Decisions

### D1. Per-account key hierarchy, all client-side
- Account key (DEK): 256-bit random, generated in the browser, non-exportable once imported for use, stored in IndexedDB as a wrapped blob plus an in-memory `CryptoKey`.
- Passphrase key (KEK-p): derived with PBKDF2-SHA-256, 600,000 iterations, 16-byte random salt, from a passphrase of at least 12 characters. Chosen because the browser's built-in cryptography implements it with no dependency; a memory-hard function would need a ~30 KB WebAssembly module and is left as a future `kdf: 2` option, which the versioned key record already allows.
- Recovery key (KEK-r): 256-bit random, displayed once as 52 base32 characters in groups of four, with a checksum group.
- The DEK is wrapped with AES-KW under both KEKs. The key record `{version, kdf, salt, iterations, wrappedByPassphrase, wrappedByRecovery, createdAt}` is the only thing the server stores.

### D2. Field split
Encrypted: task `title`, `description`, each element of `labels`; project `name`. Plaintext: `due`, `priority`, `completed_at`, `deleted_at`, `created_at`, `position`, `project_id`, `parent_id`, project `color`, `archived`. Rationale: plaintext fields are what views sort and group by, what reminders and CalDAV need to schedule, and what the server would need for a future compaction; they reveal when and how much, not what. `priority` stays plaintext so the Today view and future filters work on locked devices' cached data; the leak (a number 1–4) is accepted and documented. `labels` are encrypted per element so the string-list schema type still validates and set semantics survive.

### D3. Ciphertext format, bound to its location
Value: `"enc:v1:" + base64url(nonce(12) || AES-256-GCM(plaintext))` with additional authenticated data `entity + "\x00" + entityId + "\x00" + field`. The binding prevents a server (or a bug) from moving a ciphertext between fields or tasks; a mismatch fails authentication and the client renders an "undecryptable" placeholder while keeping the op. Overhead is 28 bytes plus base64 expansion; against the existing 64 KB per-value limit, descriptions up to ~48 KB plaintext fit, and the client refuses longer ones with a clear message before creating the op.

### D4. Hook points, local storage in plaintext
`mutate()` encrypts content fields when the account is encrypted and the device is unlocked, so the outbox holds ciphertext and offline edits upload safely. `applyOps` decrypts content fields of incoming ops before writing them to the Dexie tables, so local search, grouping and live queries keep working on plaintext. The device is the trust boundary; the threat model is the server. The DEK itself is stored in IndexedDB non-exportable and the user can "lock", which deletes it and pauses sync.
- Alternative: store ciphertext in IndexedDB and decrypt on render. Rejected: search and filters would need a plaintext index anyway, and the device already holds plaintext for unencrypted accounts.

### D5. Locked state in the sync engine
The sync engine gains a `locked` status. A device without the DEK for an encrypted account does not pull or push; the shell shows the unlock screen (passphrase or recovery key, with a client-side delay after 5 failures per minute). This avoids ever writing undecryptable content into local tables. Enrolment order on a new device: sign in → fetch profile (`encryption.enabled`) → `GET /api/v1/encryption/keys` → unlock → first sync.

### D6. Convergence unchanged
Winners are decided by `(ts, device)`; ciphertext is just the value. Two ciphertexts of equal plaintext differ, which is irrelevant because values are never compared. Idempotency holds because op ids are unchanged. The server's `Wins` and the client's per-field clock are not modified; the existing convergence tests gain ciphertext variants. The only new interaction is encrypt-on-sight (D7), which creates new ops with newer timestamps; two devices doing it concurrently produce two winners that decrypt identically.

### D7. Migration, encrypt-on-sight and history purge
- Enabling: the client iterates all local entities and calls `mutate()` for each content field, batched 200 at a time with a persisted progress marker in `meta`, resumable after reload. 500 tasks produce roughly 1,500 ops, well within the 1000-ops-per-request paging.
- Encrypt-on-sight: when an unlocked device applies an op whose content value lacks the `enc:` prefix, it stores the plaintext locally and queues an encrypted re-write. This is what keeps REST and future email-to-task intake usable: plaintext goes in, becomes ciphertext after the first unlocked sync. The item shows a small "not yet encrypted" marker until then.
- Purge: `POST /api/v1/encryption/purge-history` deletes, for that user, rows in `ops` for content fields that are not the current winner in `fields`. Safe for convergence: a device that never saw an op only needs the winner, and a device that saw a superseded op has already lost it to the winner. Trade-off: no plaintext history for `trash-and-history` on encrypted accounts, which is the point. The response reminds the user that earlier backups and SQLite free pages may still contain plaintext; the server runs `PRAGMA secure_delete=ON` for the purge statement.
- Disabling: reverse migration (decrypt, re-write plaintext ops), then `DELETE /api/v1/encryption/keys` with fresh re-authentication; devices without the key cannot disable (they have nothing to decrypt with) except through the "both lost" path that deletes the key record and tombstones the encrypted entities.

### D8. Server surface
Additive migration `encryption_keys(user_id PK, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)`. Routes behind `requireAuth`: `GET`/`PUT` (optimistic `version`, 409 `encryption_conflict`)/`DELETE /api/v1/encryption/keys` and `POST /api/v1/encryption/purge-history` (409 `encryption_disabled` without a record). `PUT` after a record exists and `DELETE` are wrapped by the step-up middleware once `mfa-totp` lands. `GET /api/v1/me` gains `encryption: {enabled, keyVersion}`. Export adds a top-level `encryption` object with the key record. `/api/v1/sync` is untouched. Sharing routes (`project-sharing`) check `encryption.enabled` and answer 409 `encryption_enabled`.

### D9. Client compatibility
The profile already carries `version`; it gains `minClientVersion` so a client older than the one that introduced ciphertext awareness shows "please reload to update" instead of rendering `enc:` strings. Because the PWA is served by the same binary, this is only a concern for a cached old shell.

### D10. Dependencies and footprint
None added. Server: no cryptography, binary unchanged within noise, memory unchanged. Client: +~8 KB gzipped for `crypto.ts`, the unlock screen and the Settings panel; key derivation takes about one second on a mid-range phone at 600k iterations, run once per enrolment or unlock.

## Risks / Trade-offs

- [User loses passphrase and recovery key] → explicit acknowledgement at enablement, recovery key download, repeated reminder in Settings; the server cannot help by design.
- [Malicious or compromised server serves tampered JavaScript] → inherent to web-delivered end-to-end encryption; documented in `docs/encryption.md`; future change can verify release signatures in the service worker.
- [Metadata leaks (dates, counts, structure, priority)] → documented boundary; the split is a product decision, revisited only with user demand.
- [Encrypt-on-sight loops between devices] → a device re-writes a field only when the current local value is plaintext; after the first ciphertext wins, nothing is plaintext, so the process terminates; test covers two devices racing.
- [Plaintext survives in op history and backups] → purge route, `secure_delete` for the purge, explicit warning about pre-existing backups.
- [PBKDF2 is not memory-hard] → 600k iterations plus a 12-character minimum; the key record is versioned so a memory-hard KDF can be adopted additively.
- [Server-side features become useless for encrypted accounts] → each such change checks `encryption.enabled` and degrades explicitly rather than silently; REST documentation explains the format.
- [Long descriptions exceed the value limit] → checked client-side before the op is created with a clear message.

## Migration Plan

Additive migration for the key table; the op log is untouched. Accounts that do not enable encryption see no change. Rolling back the server leaves the key table unused; encrypted accounts keep working because nothing server-side depends on the feature except the four routes. Rolling back the client to a version without ciphertext awareness is prevented by `minClientVersion`.

## Open Questions

- Whether to offer a memory-hard key derivation through a small WebAssembly module as `kdf: 2` once the bundle budget is reviewed.
- Whether a future `cli-client` should hold the account key to decrypt REST reads for scripts.
- Whether an owner policy should be able to require encryption for all accounts.

## Implementation notes

Decisions taken while implementing, where the code base had moved on since the design was written or a detail needed settling. Each one keeps the goals above.

- **Field split adapted to the current schema (D2).** `task.labels` holds label *ids* (the labels change made labels an entity), so encrypting its elements would hide nothing and break label lookups. The label `name` is encrypted instead, and so are the other user-written strings that appeared since: section `name`, saved view `name` and `query`, comment `body` and task `ical_extra`. `task.labels` stays a plaintext id list. Empty strings and `null` are not encrypted. Single source of truth: `internal/e2ee.ContentFields` and `CONTENT_FIELDS` in `web/src/lib/e2ee.ts` (kept in step; both test suites check the vectors against them).
- **Personal scope only.** Project sharing landed before this change. Only the account's personal scope is encrypted; shared project scopes stay plaintext for all members (their members hold no key). The first share of a project by an encrypted account answers 409 `encryption_enabled`; projects shared before enabling, and projects shared *with* an encrypted account, keep working in plaintext. Scope is resolved on the device from the cached memberships (task → project, section → project, comment → task → project).
- **Encrypt at upload, not inside `mutate()` (D4).** Web Crypto is asynchronous and cannot run inside an IndexedDB transaction, and `mutate()` is called inside transactions. Encryption therefore happens in the sync engine right before a batch is uploaded (`prepareOutgoing` in `web/src/lib/e2eeSync.ts`). This is a single choke point for every path that creates ops (edits, the migration, encrypt-on-sight, the re-seed after a server restore), so no path can bypass it. The outbox at rest holds plaintext like every other local table, which D4 already accepts (the device is the trust boundary). A retried upload re-encrypts with a fresh nonce under the same op id; the server keeps the first copy as a duplicate, both decrypt to the same text.
- **Recovery key derivation.** HKDF-SHA-256 with a fixed 32-byte zero salt and info `opentodo/e2ee/recovery-kek/v1`, so a passphrase change (new PBKDF2 salt) keeps `wrappedByRecovery` valid. The 56-character text is 52 base32 characters of the key plus 4 characters (20 bits) of its SHA-256 as a checksum; `0/1/8` are read as `O/I/B`.
- **Passphrase change needs the current passphrase.** The device key is non-extractable, so re-wrapping unwraps the account key once more, extractable and transient, from the current passphrase (or the recovery key for a reset).
- **Step-up.** `requireFresh` (from `mfa-totp`) wraps `DELETE /encryption/keys` and a `PUT` that replaces an existing record; creating the first record is not step-up (it grants nothing, and a second device gets 409 before any re-authentication prompt).
- **Undecryptable values.** The row shows the `[Cannot decrypt]` placeholder and keeps the envelope in a local-only `_e2ee.raw[field]`, which the re-seed after a restore sends back instead of the placeholder. `_e2ee.wire[field]` remembers whether the server holds plaintext, ciphertext or an undecryptable envelope for the field's current value; it drives the "not yet encrypted" marker, encrypt-on-sight and the migration's skip rule.
- **Mode reconciliation.** When incoming content disagrees with the local mode (plaintext while encrypting, ciphertext while not), the device reads the key record once and adopts the server's mode; a device that learns encryption is on and has no key stops before applying the batch (cursor unchanged, sync status "locked"). A device keeps its key after disabling so late ciphertext is decrypted and re-written as plaintext ("decrypt-on-sight"); the key is dropped when the server's record has a different `createdAt` (encryption enabled again with a new account key).
- **Purge (D7).** Besides `secure_delete`, the purge vacuums the database and truncates the write-ahead log when it deleted anything, so the values do not survive in free pages or old WAL frames; `TestPurgeHistoryKeepsWinnersOnly` checks that the plaintext no longer appears in any database file. Webhook delivery logs and in-app notifications created before enabling are not touched (notifications only exist for shared projects, which are not encrypted).
- **Server-side integrations.** CalDAV refuses the account (403 on `/dav/`, 409 on app-password creation) rather than serving placeholders that a client could write back over real titles. MCP (merged in parallel) reports `"Encrypted item"` with `encrypted: true` and never matches encrypted text in `search_tasks`. Email-to-task (merged in parallel) keeps writing plaintext Inbox tasks like REST; they are encrypted on sight and purgeable. Reminder pushes never carry a ciphertext title. Notification titles use the placeholder. Webhooks carry the stored ciphertext. History, activity and feed pages are decrypted by the web app for display.
- **Contract for `collaborative-rich-text` (in progress in parallel).** Content fields are encrypted only when their value is a string. If rich-text descriptions or comment bodies become an enveloped *string* (a type marker inside the string), the whole string is encrypted and decrypted opaquely and nothing else is needed. If they become a non-string JSON value, or a CRDT needs to merge values (the server or devices reading inside them), that change must define how its updates are encrypted; until then such values would sync in plaintext for encrypted accounts.
- **minClientVersion.** An integer, `1` for ciphertext-aware clients (`CLIENT_VERSION` in `e2ee.ts`). Clients older than this change ignore the field, so it protects only against future format changes; the PWA's auto-update covers today's cached shells.
- **Size check.** The client refuses content longer than 48,000 UTF-8 bytes per field while encryption is on (its envelope is 64,047 bytes of JSON, under the unchanged 64 KiB limit); the check applies to shared-scope content too, for simplicity.
- **Import of an encrypted export.** The export carries the key record; the importer keeps ids (so the binding still matches) but does not install the key record into the target account. Restoring encrypted data into a different account is therefore not supported yet; restoring a backup of the server is.

### Footprint (measured, D10)

- Dependencies: none added on either side. Server: no cryptography; the key record table, four routes, the purge and the explicit degradations.
- Web bundle (main chunk, `vite build`, against `main` at 19c25f8): 847.11 kB → 879.85 kB raw, 248.43 kB → 257.48 kB gzipped (**+9.1 kB gzipped**, `crypto.ts`, `e2ee.ts`, `e2eeSync.ts`, the Settings panel and the unlock screen). CSS unchanged within 0.1 kB.
- Binary (`CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"`, embedded web bundle included): 16,134,306 → 16,216,226 bytes (**+80 KB**, +0.5 %), mostly the embedded bundle.
- Runtime memory: unchanged on the server; on the client the in-memory `CryptoKey` and the transient decrypt of each incoming batch. Key derivation (600,000 PBKDF2 iterations) took about 1 s in headless Chromium on the development machine; it runs only at enrolment, unlock and passphrase changes.
