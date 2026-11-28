# Tasks

Owner decisions of 2026-11-25 in design.md. Sections 1 to 3 and 6.1 to 6.3 are the reader release (first pull request); sections 4 and 5 the writer release (second pull request), which turns on `WRITE_V2` and `e2ee.WriterRelease`.

## 1. Format and shared vectors (reader release)

- [x] 1.1 `internal/e2ee`: `PrefixV2`, `IsV2`, `Stamp(s) (int64, bool)` for `enc:v2:` (8-byte big-endian stamp, 1 to 2^53 − 1, strict base64url), `MaxEncryptableBytes` for the longer envelope, `WriterRelease`; verify `go test ./internal/e2ee -run 'TestStamp|TestFitText'`
- [x] 1.2 `internal/e2ee/vectors_test.go` writes `contentV2` (four values, the stamp bounds) and `refusedV2` (replayed under a later and an earlier timestamp, header stamp changed, moved to another field, task or entity type, relabelled envelopes, stamp 0 and above 2^53 − 1, body too short, padded and non-canonical base64) into `web/src/lib/e2ee.vectors.json`; verify `go test ./internal/e2ee -run TestVectors`
- [x] 1.3 `internal/e2ee/crypt`: `SealV2`, `SealV2WithNonce`, `SealFor` (v1 until `WriteV2`), `Open` reads both versions, `OpenAt` refuses a stamp other than the op's timestamp (`ErrStampMismatch`); verify `go test ./internal/e2ee/crypt -run 'TestV2Vectors|TestSealV2RefusesStampsOutOfRange|TestReaderReleaseWritesV1|TestContentVectors'`
- [x] 1.4 `web/src/lib/crypto.ts`: `encryptValueV2`, `decryptValue` opens both and checks the stamp against an op's timestamp (`StampMismatchError`), `stampOf`, `isV2`; `MAX_PLAINTEXT_BYTES` holds for `v2`; verify `npm test -- cryptoV2 crypto` in web/
- [x] 1.5 `e2eeEnvelope.ts`: `WRITE_V2` (false), `sealText`, `sealValue` and `openValue` take the op's timestamp; the Obsidian plugin's `Keyring` and crypter pass it; verify `npm test -- e2eeEnvelope` in web/ and the Obsidian tests (`vitest run --config vitest.config.mjs` in obsidian/)

## 2. Server rules (reader release)

- [x] 2.1 `internal/sync`: only envelope-shaped values count as `v2` (a title typed as "enc:v2: …" is text); a `v2` op whose `ts` differs from its stamp, or a malformed `v2` envelope, is refused `invalid_op` (`stamp_mismatch`; alone for clients with `invalid_ops`); a `v2` op is never clamped but refused `clock_skew`; verify `go test ./internal/sync -run 'TestV2StampMustEqualTS|TestV2NeverClamped'`
- [x] 2.2 `ApplyStrict` (REST, MCP tools, rules, relay answers) gives a `v2` op its stamp as timestamp and refuses one that would not win (`stale_ciphertext`); REST answers 409 `stale_ciphertext` with `currentTs` and 400 `clock_skew`, MCP the same codes; auth unchanged; verify `go test ./internal/sync -run TestCiphertextStampIsTimestamp`, `go test ./internal/httpapi -run 'TestStaleCiphertext|TestErrorCodesFixture'` and `go test ./internal/agenttools -run TestStampFromEnvelope`
- [x] 2.3 The relay protocol stays as it is: the device seals encrypt answers and routine device runs with its own clock, and the server stores them at the stamp (design D3); verify `npm test -- relay rules` in web/
- [x] 2.4 Import keeps a `v2` value at its stamp and refuses alone one that would not win (`WithStampTimestamps`); verify `go test ./internal/sync -run TestImportV2Stamp` and `go test ./internal/importer`
- [x] 2.5 Routine undo leaves out fields whose earlier value is `v2` and lists `encrypted text` under `not_undoable`; verify `go test ./internal/rules -run 'TestUndoSkipsEncryptedFields|TestRoutineUndo'`
- [x] 2.6 `TestServerDoesNotLinkCrypt` still passes; verify `go test ./internal/e2ee/...`

## 3. Devices (reader release)

- [x] 3.1 `e2eeSync.decryptIncoming` refuses a `v2` value whose stamp is not its op's timestamp (without the key, before decrypting), records refusals in `e2ee.olderVersions` (once each, at most 200), and keeps field, clock and sync going; the refusal of `v1` over a value held as `v2` is in place behind `WRITE_V2`; verify `npm test -- e2eeRollback` in web/
- [x] 3.2 `RowEncryption.v2` set and cleared by `applyOps` and `markSent`; verify `npm test -- e2eeRollback e2ee` in web/
- [x] 3.3 History shows a value whose stamp is not its change set's timestamp as "[Cannot decrypt]"; verify `npm test -- e2eeRollback` ("shows a mismatched value in history as undecryptable")
- [x] 3.4 Key record high-water mark (design D6) in `e2ee.ts`, a warning only: the device keeps its own record, sync and the re-send after a restore go on, Settings offers **Upload this device's key record**; the same mark in `ot encryption unlock`; verify `npm test -- e2eeRollback` ("an older key record", including "a server restored from an older backup with an older record still gets the re-seed") and `go test ./internal/cli -run TestKeyRecordHighWater`
- [x] 3.5 `ot vault` and the Obsidian plugin's vault keep an older ciphertext out of their store; verify `go test ./internal/vault -run TestStoreRefusesOlderCiphertext` and `obsidian/src/vault/store.test.ts`
- [x] 3.6 Settings → End-to-end encryption: one line while refusals are recorded, with **Details** (a dialog listing them, with **Clear**), and one line for a refused key record; translated in every shipped catalog; verify `npm test -- encryptionPanel` in web/, the stories `Settings/Encryption` "Older versions kept" and "Older key record", and `make i18n-check`

## 4. Writers (writer release)

- [ ] 4.1 Turn on `WRITE_V2` and `e2ee.WriterRelease`: `prepareOutgoing` seals `v2` with each op's timestamp, again after a `clock_skew` re-stamp; the Obsidian plugin and `ot vault` seal with the op's timestamp; verify `npm test -- e2ee e2eeRollback` in web/ (flip the reader-release assertions), the Obsidian tests and `go test ./internal/vault ./internal/e2ee/...`
- [ ] 4.2 `ot mcp --decrypt`, `ot notes` and the other REST writers seal with `max(now, currentTs + 1)` and retry once on `stale_ciphertext`; verify `go test ./internal/cli -run 'TestMCPDecryptRetriesStale|TestNotesRetriesStale'`
- [ ] 4.3 Every `ApplyStrict` caller that writes a content field either keeps the envelope's stamp or writes no envelope again; verify `go test ./internal/... -run TestNoServerPathReplaysEnvelope`
- [ ] 4.4 Bind the key record's version and creation time to the account key (a MAC under a key derived from it, checked after unwrapping), so that a relabelled older record is noticed too (design D6); verify `npm test -- e2eeRollback` and `go test ./internal/e2ee/crypt ./internal/cli`
- [ ] 4.5 Device re-emit paths: review every path that sends a value again (re-seed, encrypt-on-sight, the re-seal) for the v2 rules; verify `npm test -- e2ee e2eeRollback` in web/
- [ ] 4.6 Retry on `stale_ciphertext` for relay answers and routine device runs; verify `npm test -- relay rules` in web/ and `go test ./internal/agenttools ./internal/rules`
- [ ] 4.7 Routine undo lists every ciphertext field of an encrypted account under `not_undoable`, `v1` included; verify `go test ./internal/rules -run TestUndoSkipsEncryptedFields`

## 5. Migration and compatibility (writer release)

- [ ] 5.1 Catch-up `format: 2` re-seals values held as `v1`, resumable and idempotent; then `v1` is refused over any held value; verify `npm test -- e2eeMigration e2eeRollback` in web/ ("re-seals v1 once", "a second device writes nothing", "v1 refused after the re-seal")
- [ ] 5.2 Server refuses `v1` writes for encrypted accounts (409 `ciphertext_outdated`), `MinClientVersion` and `CLIENT_VERSION` 2; verify `go test ./internal/httpapi -run TestCiphertextOutdated` and `go test ./internal/sync -run TestV1RefusedForEncryptedAccount`
- [ ] 5.3 Op volume of the re-seal on 500 tasks within the existing budget; verify `npm test -- e2eeMigration.perf` in web/

## 6. Docs and checks

- [x] 6.1 Reader release: `docs/e2ee.md` (the `v2` format, what devices refuse), `docs/security/threat-model.md`, `docs/security/limits.md`, `docs/api.md` (`stale_ciphertext`, `clock_skew`), changelog `changelog.d/Security/e2ee-rollback.md`; verify `make docs` and `make docs-check`
- [ ] 6.2 Writer release: threat model moves Rollback to Defended with the remaining limits, `docs/cli.md`, `docs/api.md` (`ciphertext_outdated`), a second changelog fragment; verify `make docs-check`
- [x] 6.3 Older readers meeting `v2`: the web app marks an unknown version undecryptable and never writes it back (`decryptIncoming` keeps the envelope as `raw`), `ot vault` and the plugin's vault mark it undecryptable (`view.text`, `openAll`); verify `npm test -- e2ee` and `go test ./internal/vault`
- [ ] 6.4 Archive the change with the writer release; `make check`, `openspec validate --all --strict`
