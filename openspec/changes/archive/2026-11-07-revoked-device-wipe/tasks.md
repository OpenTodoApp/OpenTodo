## 1. Server

- [x] 1.1 Migration `0061_revoked_sessions.sql`: `session_wipe_keys` and `revoked_sessions`; verify `go test ./internal/store`
- [x] 1.2 `internal/auth/revoke.go`: `WipeKey`, `RevokedProof`, `revokeSessionsTx`, `PruneRevokedSessions`, `NextRevokedExpiry`; `SignOutEverywhere`, `Deactivate` and `DeleteUser` record what they end; verify `go test ./internal/auth -run Revoke`
- [x] 1.3 `auth/status` returns `wipeKey` while signed in and `revoked.proof` for a revoked cookie; verify `go test ./internal/httpapi -run TestRevokedDevice`
- [x] 1.4 Relay opt-ins of ended sessions end and their streams close (`relay.Store.DisableEnded`); verify `go test ./internal/httpapi -run TestRevokedDeviceEndsRelay`
- [x] 1.5 Housekeeping prunes expired records; verify `go test ./internal/auth -run TestRevokedSessionsKeepTheirProof`

## 2. Web app

- [x] 2.1 `web/src/lib/revocation.ts` stores the key and checks a proof with Web Crypto; verify `npm test -- revocation`
- [x] 2.2 `App.refresh` wipes on a matching proof, signs the cookie out and shows the notice; a forged proof wipes nothing; verify `npm test -- revokedDevice` (the App with fake-indexeddb and `waitFor`) and `scripts/e2e-revoked.mjs` in `make e2e`
- [x] 2.3 The Sign out everywhere and Deactivate confirmations say other devices remove their copy and lose unsynced changes; translations; verify `make i18n-check`

## 3. Docs and checks

- [x] 3.1 `docs/security/threat-model.md` (moved to Defended with the remaining limit), `limits.md`, `how-we-verify.md`, `docs/api.md`; `changelog.d/Security/revoked-device-wipe.md`; verify `make docs-check` and `make repo-check`
- [x] 3.2 `go test ./...`, `go vet ./...`, `npm test`, `npm run build`, `make bundle-budget`, `make openspec-validate`
