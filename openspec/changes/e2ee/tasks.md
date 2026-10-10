# Tasks

## 1. Client cryptography

- [ ] 1.1 `web/src/lib/crypto.ts`: account key generation, PBKDF2 derivation, AES-KW wrapping for passphrase and recovery key, recovery key formatting with checksum, AES-GCM encrypt/decrypt with the entity/id/field binding and the `enc:v1:` encoding; verify `npm test` passes `crypto.test.ts` (round trip, wrong passphrase fails, moved ciphertext fails authentication, recovery key checksum)
- [ ] 1.2 Local key storage: non-exportable key in IndexedDB `meta`, lock/unlock, failure delay after 5 attempts per minute; verify `keystore.test.ts` with fake-indexeddb

## 2. Client data layer

- [ ] 2.1 Field split table shared by `mutate()` and `applyOps`; encryption in `mutate()` for unlocked encrypted accounts, decryption in `applyOps`, undecryptable placeholder, plaintext size check against the per-value limit; verify `ops.test.ts` gains ciphertext variants of order-independence, idempotency and stale-remote tests, and `TestEncryptedFieldSplit` asserts `due` and `priority` stay plaintext
- [ ] 2.2 Encrypt-on-sight: plaintext content in an incoming op is stored and a ciphertext re-write queued; verify `encryptOnSight.test.ts` including two devices racing and termination
- [ ] 2.3 Sync engine `locked` status: no pull or push without the key, status text, resume on unlock; verify `sync.test.ts` for locked → unlocked transition
- [ ] 2.4 Migration job: resumable batched re-encryption with progress in `meta`, and the reverse job for disabling; verify `migration.test.ts` resumes after an interrupted run and ends with no plaintext content fields

## 3. Server

- [ ] 3.1 Migration for `encryption_keys`; routes `GET/PUT/DELETE /api/v1/encryption/keys` with optimistic version (409 `encryption_conflict`), `POST /api/v1/encryption/purge-history` (409 `encryption_disabled`), `encryption` in the profile and export, `minClientVersion` in the profile; verify `TestEncryptionKeysRoutesAuthAndConflict`, `TestPurgeHistoryKeepsWinnersOnly` (a fresh device still converges after purge), `TestExportIncludesKeyRecord` with `go test ./...`
- [ ] 3.2 Confirm the sync path is untouched: ciphertext strings validate under the existing schema and limits; verify `TestCiphertextValuesValidateUnchanged` and that `internal/sync/ops.go` has no diff
- [ ] 3.3 `docs/api.md` (ciphertext format, new routes), `docs/sync.md` (values may be ciphertext); verify examples match handler tests

## 4. Client UI

- [ ] 4.1 Settings "Encryption" panel: enable wizard (passphrase, recovery key display with copy/download, acknowledgement), progress, change passphrase, reset with recovery key, purge history with backup warning, lock, disable, "both lost" path; keyboard reachable; verify component tests for each state in `npm test` and a browser run; `npm run build` passes
- [ ] 4.2 Unlock screen after sign-in on a new device, locked state in the shell with sync status "locked", "not yet encrypted" marker on items awaiting re-write, undecryptable placeholder; verify a browser run with two devices and a REST-written plaintext task; `npm run build` passes

## 5. Docs and release

- [ ] 5.1 New `docs/encryption.md` (threat model, what is and is not hidden, recovery, backups caveat, integration consequences), `SECURITY.md`, `README.md`, CHANGELOG entry, and notes in the `reminders`, `caldav`, `email-to-task`, `mcp-server`, `webhooks` and `project-sharing` change READMEs that content fields are opaque for encrypted accounts; verify links resolve and `make check` passes
- [ ] 5.2 End-to-end run: account with existing tasks enables encryption → server rows show ciphertext for titles and plaintext for due dates → second device enrols with passphrase → concurrent title edits converge → offline edit on device A uploads ciphertext → REST plaintext task becomes ciphertext after sync → purge → change passphrase → recovery reset → disable; verify the run completes without console errors
