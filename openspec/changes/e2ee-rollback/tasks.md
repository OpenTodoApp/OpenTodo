# Tasks

Waiting for the owner's decisions in design.md (Open questions) before any of these starts.

## 1. Format and shared vectors (reader release)

- [ ] 1.1 `internal/e2ee`: `PrefixV2`, `Stamp(s) (int64, bool)` for `enc:v2:` (8-byte big-endian stamp, 1 to 2^53 − 1), and `MaxPlaintext` for the longer envelope; verify `go test ./internal/e2ee -run 'TestStamp|TestFit'`
- [ ] 1.2 `internal/e2ee/vectors_test.go` writes `contentV2` (four values, the stamp bounds, and refusal cases: changed stamp, relabelled envelopes, stamp 0 and above 2^53 − 1, body too short) into `web/src/lib/e2ee.vectors.json`; verify `go test ./internal/e2ee -run TestVectors -update`, then `go test ./internal/e2ee -run TestVectors`
- [ ] 1.3 `internal/e2ee/crypt`: `SealV2`, `SealV2WithNonce`, `Open` reads both versions and returns the stamp, refusing a mismatch with the expected timestamp; verify `go test ./internal/e2ee/crypt -run 'TestContentVectors|TestV2'`
- [ ] 1.4 `web/src/lib/crypto.ts`: `encryptValue` with a stamp writes `v2`, `decryptValue` opens both and checks the stamp against the op's timestamp (`StampMismatchError`); `MAX_PLAINTEXT_BYTES` and `MAX_DOC_CHARS_ENCRYPTED` hold for `v2`; verify `npm test -- crypto` ("known-answer vectors", "v2 vectors") in web/
- [ ] 1.5 `e2eeEnvelope.ts` `sealValue` and `openValue` take the op's timestamp; the Obsidian plugin's `Keyring` and crypter pass it; verify `npm test -- e2eeEnvelope` in web/ and `make test-obsidian`

## 2. Server rules (reader release)

- [ ] 2.1 `internal/sync`: a `v2` op whose `ts` differs from its stamp is refused `invalid_op` (`stamp_mismatch`); a `v2` op is never clamped, it is refused `clock_skew`; verify `go test ./internal/sync -run 'TestV2StampMustEqualTS|TestV2NeverClamped'`
- [ ] 2.2 Server-side writes of a client-made `v2` envelope (REST, MCP tools, relay answers, import) take the stamp as the field's timestamp; 409 `stale_ciphertext` with `currentTs`, 400 `clock_skew`; auth unchanged; verify `go test ./internal/httpapi -run 'TestStaleCiphertext|TestCiphertextStampIsTimestamp|TestStaleCiphertextNeedsAuth'` and `go test ./internal/agenttools -run TestStampFromEnvelope`
- [ ] 2.3 Relay encrypt items carry `ts`; verify `go test ./internal/agenttools -run TestRelayEncryptNamesStamp`
- [ ] 2.4 Import keeps a `v2` value only when its stamp wins; verify `go test ./internal/importer -run TestImportV2Stamp`
- [ ] 2.5 `TestServerDoesNotLinkCrypt` still passes; verify `go test ./internal/e2ee/... -run TestServerDoesNotLinkCrypt`

## 3. Devices (reader release)

- [ ] 3.1 `e2eeSync.decryptIncoming` applies the table of design D4: refuses a stamp mismatch and `v1` over a field held as `v2`, records refusals in `e2ee.rollbacks` (at most 200), and keeps field, clock and sync going; verify `npm test -- e2eeRollback` in web/ ("replay under a new timestamp is refused", "replay with the original timestamp loses quietly", "downgrade to v1 is refused", "a new device accepts every winner", "two devices refusing converge on the next edit")
- [ ] 3.2 `RowEncryption.v2` set and cleared by `decryptIncoming` and `markSent`; verify `npm test -- e2ee` in web/
- [ ] 3.3 `displayValue` shows a mismatched stamp as "[Cannot decrypt]"; verify `npm test -- e2ee` ("history shows a mismatched stamp as undecryptable")
- [ ] 3.4 Key record high-water mark (design D6) in `e2ee.ts` and `ot encryption unlock`; verify `npm test -- e2ee` ("refuses an older key record", "adopts the record its own upload returns") and `go test ./internal/cli -run TestKeyRecordHighWater`
- [ ] 3.5 Settings → Encryption: one line and a Details dialog while refusals are recorded, with Clear; strings in the i18n catalogue; verify the Storybook story `encryptionSettings` "Older versions kept" with `make ui-check`, and `make i18n-check`

## 4. Writers (writer release)

- [ ] 4.1 `prepareOutgoing` seals `v2` with each op's timestamp, again after a `clock_skew` re-stamp; verify `npm test -- e2ee` ("sealed with the op's timestamp", "sealed again after clock_skew")
- [ ] 4.2 The Obsidian plugin and `ot vault` seal with the op's timestamp; verify `make test-obsidian` and `go test ./internal/vault ./internal/cli -run 'TestVaultSealsWithTS'`
- [ ] 4.3 `ot mcp --decrypt` and `ot notes` seal with `max(now, currentTs + 1)` and retry once on `stale_ciphertext`; verify `go test ./internal/cli -run 'TestMCPDecryptRetriesStale|TestNotesRetriesStale'`
- [ ] 4.4 `relay.ts` seals with the stamp of each item and refuses an item without one; verify `npm test -- relay` in web/
- [ ] 4.5 Routine device runs and proposals seal with the timestamp their commit carries; verify `npm test -- deviceRun deviceProposal` in web/
- [ ] 4.6 Every `ApplyStrict` caller that writes a content field either keeps the envelope's stamp or writes no envelope again; verify `go test ./internal/... -run TestNoServerPathReplaysEnvelope`
- [ ] 4.7 Routine undo lists encrypted fields of encrypted accounts under `not_undoable`; verify `go test ./internal/rules -run TestUndoSkipsEncryptedFields`

## 5. Migration and compatibility (writer release)

- [ ] 5.1 Catch-up `format: 2` re-seals values held as `v1`, resumable and idempotent; then `v1` is refused over held values; verify `npm test -- e2eeMigration e2eeRollback` in web/ ("re-seals v1 once", "a second device writes nothing", "v1 refused after the re-seal")
- [ ] 5.2 Server refuses `v1` writes for encrypted accounts (409 `ciphertext_outdated`), `MinClientVersion` and `CLIENT_VERSION` 2; verify `go test ./internal/httpapi -run TestCiphertextOutdated` and `go test ./internal/sync -run TestV1RefusedForEncryptedAccount`
- [ ] 5.3 Op volume of the re-seal on 500 tasks within the existing budget; verify `npm test -- e2eeMigration.perf` in web/

## 6. Docs and checks

- [ ] 6.1 `docs/e2ee.md` (format, rollback, limits), `docs/security/threat-model.md` (Rollback under Defended, remaining limits under Not defended, the tests under Verified by), `docs/security/limits.md`, `docs/api.md` (`stale_ciphertext`, `ciphertext_outdated`, `clock_skew`), `docs/cli.md`; verify `make docs` and `make docs-check`
- [ ] 6.2 Changelog fragments `changelog.d/Security/e2ee-rollback-readers.md` and `changelog.d/Security/e2ee-rollback.md`, one per release; verify `make repo-check`
- [ ] 6.3 Older readers meeting `v2`: the web app, `ot`, `ot vault` and the Obsidian plugin of the release before the reader release mark it undecryptable and never write the placeholder back; verify `go test ./internal/vault -run TestUnknownVersionNotWrittenBack` and `make test-obsidian` ("unknown envelope version stays untouched")
- [ ] 6.4 `make check`, `go test ./...`, and in web/ `npm test` and `npm run build`; `make bundle-budget`; `openspec validate --all --strict`
