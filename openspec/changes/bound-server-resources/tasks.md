# Tasks

## 1. Password hashing (SEC-5, SEC-15)

- [x] 1.1 Policy checks before hashing in registration, project invite registration and password reset. Verify: `go test ./internal/auth -run 'TestRegisterChecksPolicyBeforeHashing|TestRegisterSetupTokenBeforeHashing'`.
- [x] 1.2 Hashing slots with a one-second wait and `ErrBusy`, mapped to 503 `busy` with `Retry-After`. Verify: `go test ./internal/auth -run TestHashSlotsBusy`; `go test ./internal/httpapi -run TestBusyHashingAnswers503`.
- [x] 1.3 Sign-in refuses passwords over 1,024 bytes without hashing; passwordless accounts burn the dummy hash. Verify: `go test ./internal/auth -run 'TestLoginRefusesOverlongPassword|TestPasswordlessAccountBurnsHash'`.

## 2. Live-update streams (SEC-6)

- [x] 2.1 10 streams per account, 20 per client address, 2,000 per server, 503 `busy` beyond the last two. Verify: `go test ./internal/httpapi -run 'TestEvents'`; `go test ./internal/sync -run Notifier`.

## 3. Push (INT-4)

- [x] 3.1 20 subscriptions per account, replacing the least recently registered. Verify: `go test ./internal/push -run TestSubscriptionCapReplacesOldest`.
- [x] 3.2 Sends for 8 accounts at a time with a per-account budget per pass. Verify: `go test -race ./internal/push -run 'TestSlowEndpointDoesNotDelayOthers|TestUserSendBudget'`.
- [x] 3.3 Disable after 20 consecutive failures and a day without delivery; re-registering re-enables. Verify: `go test ./internal/push -run TestDisabledSubscriptionIsSkipped`.

## 4. Last-use writes (SEC-7, INT-9)

- [x] 4.1 Token and app-password last-use written at most once a minute. Verify: `go test ./internal/auth -run TestLastUseWrittenAtMostOnceAMinute`.
- [x] 4.2 `requireSessionOrFull` reads the resolved scope. Verify: `go test ./internal/httpapi -run TestRequireSessionOrFullUsesResolvedToken`.

## 5. JSON bodies (SEC-14)

- [x] 5.1 One decoder: unknown fields, trailing data, 413 `too_large`, plain messages; loose for sync, push subscriptions and passkeys. Verify: `go test ./internal/httpapi -run 'TestJSONBody'`; `go test ./internal/httpapi` (whole package).
- [x] 5.2 Web and CLI send only defined fields; `busy` has a translated message. Verify: `cd web && npx tsc --noEmit && npx vitest run src/lib/i18n`; `go test ./internal/cli`; `make i18n-check`.

## 6. Docs and checks

- [x] 6.1 `docs/api.md`, `docs/sync.md`, `docs/architecture.md`, CHANGELOG. Verify: `make docs-check`; `go vet ./...`; `go test ./...`; `npx --yes @fission-ai/openspec validate --all --strict`.
