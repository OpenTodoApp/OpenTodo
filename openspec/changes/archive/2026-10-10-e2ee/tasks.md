# Tasks

## 1. Client cryptography

- [x] 1.1 `web/src/lib/crypto.ts`: account key generation, PBKDF2 derivation, AES-KW wrapping for passphrase and recovery key, recovery key formatting with checksum, AES-GCM encrypt/decrypt with the entity/id/field binding and the `enc:v1:` encoding; verify `npm test` passes `crypto.test.ts` (round trip, wrong passphrase fails, moved ciphertext fails authentication, recovery key checksum)
  - Also known-answer vectors (`web/src/lib/e2ee.vectors.json`) generated and checked by an independent Go implementation (`internal/e2ee/vectors_test.go`), RFC 3394 AES-KW vector, tamper tests on nonce, ciphertext and tag.
- [x] 1.2 Local key storage: non-exportable key in IndexedDB `meta`, lock/unlock, failure delay after 5 attempts per minute; verify `keystore.test.ts` with fake-indexeddb
  - Implemented in `web/src/lib/e2ee.ts`; the tests are in `e2ee.test.ts` ("key storage and unlocking"), including offline unlock with the cached record and the 409 for a second device.

## 2. Client data layer

- [x] 2.1 Field split table shared by `mutate()` and `applyOps`; encryption in `mutate()` for unlocked encrypted accounts, decryption in `applyOps`, undecryptable placeholder, plaintext size check against the per-value limit; verify `ops.test.ts` gains ciphertext variants of order-independence, idempotency and stale-remote tests, and `TestEncryptedFieldSplit` asserts `due` and `priority` stay plaintext
  - Encryption runs at upload (`prepareOutgoing`), decryption before `applyOps` (`decryptIncoming`); see design.md "Implementation notes" for why. Field split adapted to label ids. Tests in `e2ee.test.ts` ("field split and transport"), server side in `internal/sync/e2ee_test.go`.
- [x] 2.2 Encrypt-on-sight: plaintext content in an incoming op is stored and a ciphertext re-write queued; verify `encryptOnSight.test.ts` including two devices racing and termination
  - `normalizeOnSight` in `e2eeSync.ts`; tested in `e2ee.test.ts` ("two devices": racing devices, termination, stale plaintext ignored).
- [x] 2.3 Sync engine `locked` status: no pull or push without the key, status text, resume on unlock; verify `sync.test.ts` for locked → unlocked transition
  - Tested in `e2ee.test.ts` (lock → no request → unlock → sync; a device that learns of encryption from ciphertext locks without applying).
- [x] 2.4 Migration job: resumable batched re-encryption with progress in `meta`, and the reverse job for disabling; verify `migration.test.ts` resumes after an interrupted run and ends with no plaintext content fields
  - `startMigration`/`runMigration` in `e2eeSync.ts`; tested in `e2ee.test.ts` ("migration job", 450 tasks, interrupted after one batch) and the disable flow.

## 3. Server

- [x] 3.1 Migration for `encryption_keys`; routes `GET/PUT/DELETE /api/v1/encryption/keys` with optimistic version (409 `encryption_conflict`), `POST /api/v1/encryption/purge-history` (409 `encryption_disabled`), `encryption` in the profile and export, `minClientVersion` in the profile; verify `TestEncryptionKeysRoutesAuthAndConflict`, `TestPurgeHistoryKeepsWinnersOnly` (a fresh device still converges after purge), `TestExportIncludesKeyRecord` with `go test ./...`
  - Migration `0023_e2ee.sql`. Also `TestSharingRefusedForEncryptedAccount`, `TestCaldavRefusedForEncryptedAccount`, `TestRESTPlaintextWriteThenCiphertext`, `TestPayloadNeverCarriesCiphertext` (push), `TestNotificationsNeverShowCiphertext`, `TestEncryptedContentIsOpaque` (MCP), `TestMigrationEncryptionKeys`.
- [x] 3.2 Confirm the sync path is untouched: ciphertext strings validate under the existing schema and limits; verify `TestCiphertextValuesValidateUnchanged` and that `internal/sync/ops.go` has no diff
  - `git diff main -- internal/sync/ops.go` is empty; `TestCiphertextConvergence` adds ciphertext order-independence on the server.
- [x] 3.3 `docs/api.md` (ciphertext format, new routes), `docs/sync.md` (values may be ciphertext); verify examples match handler tests

## 4. Client UI

- [x] 4.1 Settings "Encryption" panel: enable wizard (passphrase, recovery key display with copy/download, acknowledgement), progress, change passphrase, reset with recovery key, purge history with backup warning, lock, disable, "both lost" path; keyboard reachable; verify component tests for each state in `npm test` and a browser run; `npm run build` passes
  - `web/src/app/EncryptionPanel.tsx`, tests in `encryptionPanel.test.tsx`.
- [x] 4.2 Unlock screen after sign-in on a new device, locked state in the shell with sync status "locked", "not yet encrypted" marker on items awaiting re-write, undecryptable placeholder; verify a browser run with two devices and a REST-written plaintext task; `npm run build` passes
  - `web/src/app/UnlockScreen.tsx`, marker in `TaskRow.tsx`, history/activity/feed decrypted for display.

## 5. Docs and release

- [x] 5.1 New `docs/encryption.md` (threat model, what is and is not hidden, recovery, backups caveat, integration consequences), `SECURITY.md`, `README.md`, CHANGELOG entry, and notes in the `reminders`, `caldav`, `email-to-task`, `mcp-server`, `webhooks` and `project-sharing` change READMEs that content fields are opaque for encrypted accounts; verify links resolve and `make check` passes
  - Written as `docs/e2ee.md`. Those changes are archived (their READMEs are history), so the notes went into the live docs instead: `docs/caldav.md`, `docs/reminders.md`, `docs/email.md`, `docs/mcp.md`, `docs/webhooks.md` and the Sharing part of `docs/api.md`. The contract for the parallel `collaborative-rich-text` change is in design.md (not edited in its folder to avoid conflicts).
- [x] 5.2 End-to-end run: account with existing tasks enables encryption → server rows show ciphertext for titles and plaintext for due dates → second device enrols with passphrase → concurrent title edits converge → offline edit on device A uploads ciphertext → REST plaintext task becomes ciphertext after sync → purge → change passphrase → recovery reset → disable; verify the run completes without console errors
  - One Playwright run (Chromium, two contexts, private server): every step passed with no console errors, except "concurrent title edits converge", which was not driven through the browser UI; it is covered by `e2ee.test.ts` ("a second device enrols … both converge on concurrent edits") and `TestCiphertextConvergence`.
