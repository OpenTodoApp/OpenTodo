# Tasks

## 1. Lookup and reasons

- [x] 1.1 `useMapLookup` with its session cache in `lib/assistantBlockData.ts` (D1). Verify with a vitest test: an address-only item is looked up once through `/api/v1/maps/search`, pinned and marked approximate; maps off makes no request; a miss is cached.
- [x] 1.2 `MapBlock` uses it, marks "found by address", and shows the reason line (D2). `LocationMap` exports `hasWebGL` and forwards `onUnavailable`. Verify with tests in `assistantBlocks.test.tsx` for the lookup (the map gets the found point, the stored location is unchanged), maps off (reason, no request) and nothing found (reason).
- [x] 1.3 Strings in every locale. Verify with `make i18n-check`.

## 2. Instructions

- [x] 2.1 `SystemRules` gains the rules on showing blocks, and the manifest and prompt vectors are regenerated (`go test ./internal/assistant -run Device -update`). Verify with `go test ./internal/assistant`, including a check in `blocks_test.go` that the system prompt carries the new rules.

## 3. Checks

- [x] 3.1 Verify that `go test ./internal/assistant ./internal/httpapi`, `cd web && npm test && npm run build`, `make bundle-budget`, `make openspec-validate` and `make docs-check` pass.
