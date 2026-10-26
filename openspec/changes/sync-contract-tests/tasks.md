## 1. Harness

- [x] 1.1 `vitest.contract.config.ts`, global setup starting `bin/opentodo` on a fresh data directory, device helper routing `fetch` with a per-device session; `npm test` excludes `*.contract.test.ts`
- [x] 1.2 `npm run test:contract`; `CONTRIBUTING.md`

## 2. Tests

- [x] 2.1 `src/lib/sync.contract.test.ts`: two devices converge, offline edits converge on the later one, `clock_skew` corrected, viewer refusal reported and undone, offline queue sent on reconnect; passes three runs in a row locally (about 3 s)

## 3. CI

- [x] 3.1 The server job runs `npm run test:contract` after building `bin/opentodo`; `node --test scripts/repo-checks.test.mjs` checks the order
