## 1. Icon catalogue on the server

- [x] 1.1 Generate the server copy of the icon catalogue from the web catalogue introduced by `icons-and-section-style` (name, label, keywords), with a Go test that fails when the two differ; verify with `go test ./internal/agenttools/...`; Done by `icons-and-section-style`: `internal/iconset` (name, category, keywords) generated from `web/src/ui/icons/catalogue.json`, with `TestMatchesWebCatalogue`.
- [x] 1.2 Add the read tool `list_icons` (query, limit 1–200, default 50) with a read-only annotation, listed for every token; tests for search, bad limit and the 401 without a token in `internal/mcp`; verify with `go test ./internal/mcp/... ./internal/agenttools/...`; Tests: `TestListIcons` (agenttools), `TestListIconsTool` (mcp), the 401 in `TestMcpCookieRejected401` (httpapi).
- [x] 1.3 Validate every `icon` argument of write tools against the catalogue (`-32602` naming `icon`); verify with an agenttools test; `TestUpdateProjectStructure`, `TestSections`.

## 2. Project and section write tools

- [x] 2.1 Move `update_project` out of the REST-only set and widen it to `name`, `color`, `icon`, `parent_id` (cycle refused as `invalid`), `position`; keep refusing `description`, `archived` and `deleted`; update `TestRestOnlyToolHiddenFromMCP` and the tool-surface test; verify with `go test ./internal/agenttools/... ./internal/mcp/...`; `TestUpdateProjectOnMCP`, `TestUpdateProjectStructure`; tool-surface and golden tests updated.
- [x] 2.2 Add `set_favourite` for `kind: "project"` (append or remove in `user_prefs.favourites`, idempotent, other entries' order kept); test the convergence with a concurrent device write; verify with `go test ./internal/agenttools/...`; `TestSetFavourite`.
- [x] 2.3 Add `create_sections`, `update_sections` (name, color, icon, position) and `reorder_sections` (listed sections first, in order); test offline device edits converging per field; verify with `go test ./internal/agenttools/...`; `TestSections`.
- [x] 2.4 Keep the agent REST routes working (`update_project` via `CallAll` unchanged in behaviour); verify with the existing agent REST tests in `internal/httpapi`; `TestUpdateProjectOnMCP` (CallAll) and the httpapi agent REST tests pass.

## 3. Encrypted accounts on remote MCP

- [x] 3.1 For encrypted accounts, list `update_tasks`, `update_project`, `create_sections` and `update_sections` with "ciphertext only" content arguments; allow colour, icon, parent, position, Favourites and section order in plaintext; verify with agenttools tests for both scenarios in "Encrypted accounts and write tools"; Every write tool is listed with ciphertext-only wording (design, Implementation notes). `TestEncryptedStructure`, `TestToolsListByPermission`, httpapi `TestEncryptedAccountWriteRules`.
- [x] 3.2 Accept a well-formed `enc:v1:` envelope for a content argument of an encrypted account and store it unchanged; keep `encryption_enabled` for plaintext; verify with a test that applies the op and reads back the identical string; `TestEncryptedStructure`, httpapi `TestEncryptedAccountWriteRules`.
- [x] 3.3 Add the optional caller-chosen `id` on `create_tasks`, `create_project`, `create_label` and `create_sections` (UUID check, `conflict` when taken, retry with the same `id` and `client_request_id` returns the original result); verify with agenttools tests for the three scenarios of "Caller-chosen ids on create"; Also on `add_comment`. `TestChosenIDs`.

## 4. Crypto in the CLI

- [x] 4.1 Add `internal/e2ee/crypt` (AES-256-GCM envelope with the entity/id/field AAD, PBKDF2-SHA-256, HKDF recovery key, RFC 3394 key unwrap) on the Go standard library only; export known-answer vectors from `web/src/lib/crypto.ts` into `internal/e2ee/testdata` and test both sides against them; verify with `go test ./internal/e2ee/...` and `cd web && npm test -- crypto`; Vectors: the existing shared `web/src/lib/e2ee.vectors.json` (crypto.test.ts passes). `internal/e2ee/crypt`, `TestContentVectors`, `TestPassphraseAndRecoveryVectors`, `TestKeyWrapRFC3394`.
- [x] 4.2 Check that the server binary does not link `internal/e2ee/crypt` (a test over `go list -deps ./cmd/opentodo`); verify with `go test ./internal/e2ee/...`; `TestServerDoesNotLinkCrypt`.

## 5. Unlock, lock and the decrypting bridge

- [x] 5.1 `ot encryption unlock|lock|status`: no-echo passphrase, `--recovery`, `--passphrase-file`, key-record bounds, retry delay after 5 failures a minute, owner-only key file per profile with the key version; CLI tests with a fake server for every scenario of "Unlocking the account key on the user's machine"; verify with `go test ./internal/cli/...`; `TestEncryptionUnlockLockStatus`, `TestEncryptionUnlockFailures`, `TestEncryptionUnlockRefusesOutOfRangeRecord`.
- [x] 5.2 Let the stdio bridge start with an `agent` token (and keep read-only mode read-scoped only); update the bridge tests for "Agent token accepted" and "Read-only mode cannot be weakened"; verify with `go test ./internal/cli/...`; `TestMCPBridgeAgentTokenAndReadOnly`, `TestMCPBridgeRejectsFullTokenByDefault`.
- [x] 5.3 `ot mcp --decrypt`: decrypt attributable envelopes in results and resources, encrypt content arguments with chosen ids on creates, rewrite the ciphertext-only wording; a table of attributable result shapes with a test that fails when a tool's result gains an uncovered content field; verify with `go test ./internal/cli/...` against an in-process server; Placeholders are replaced by reading the raw value over REST (design, Implementation notes). `TestMCPBridgeDecrypts` against the in-process server.
- [x] 5.4 Refuse to start without a usable key, return a stale-key error after a key-version change, never prompt; write the plaintext notice to stderr; verify with CLI tests for every scenario of "Starting without a usable key" and "Plaintext notice"; `TestMCPBridgeDecryptRefusesWithoutKey`, `TestMCPBridgeStaleKey`; the notice in `TestMCPBridgeDecrypts`.
- [x] 5.5 End-to-end: an encrypted account created in the web app, unlocked with `ot encryption unlock`, an assistant session through `ot mcp --decrypt` that lists, creates and renames, and a web device that shows the plaintext after sync; verify with a scripted test in `scripts/` run by `make e2e`; `scripts/e2e-mcp-decrypt.mjs`, run by `make e2e` (which now builds `bin/ot`); passes locally.

## 6. Settings, docs and wrap-up

- [x] 6.1 Assistants section of Settings: the encrypted-account explanation of "Notice in Settings"; translations in every catalogue; verify with `cd web && npm test && npm run build` and `node scripts/i18n-check.mjs`; `assistantsSettings.test.tsx`; i18n-check ok.
- [x] 6.2 Docs: `docs/mcp.md` (new tools, icons, encrypted accounts, `--decrypt` and the plaintext notice), `docs/cli.md` (`ot encryption`, `ot mcp --decrypt`), `docs/e2ee.md` (where the key lives, `ot encryption lock`); verify with `make docs-check`; Also `docs/architecture.md`. `make docs-check` ok.
- [ ] 6.3 When archiving after or before `time-tracking`, reconcile the "Read token sees only read tools" scenario of "Read-only tools" so it counts `list_icons` and `list_time_entries`; verify with `make openspec-validate`
- [x] 6.4 Run `make check`; add the CHANGELOG entry under Unreleased; `make ci-checks`, `go test ./...`, `go vet`, staticcheck, the web suite (3,715 tests, UTC) and the build pass; inside `make check` the known load flake `dashboardDrop.test.tsx` failed once and passes alone.
