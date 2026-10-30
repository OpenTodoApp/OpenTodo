## 1. Built-artifact tests

- [x] 1.1 `REQUIRE_BUILT=1` makes `serviceWorker.test.ts` and `workbench.test.ts` fail without a build; `npm run test:built` passes after `npm run build` and fails with an empty `internal/web/dist`
- [x] 1.2 The web job runs `npm run test:built` after `npm run build`; `node --test scripts/repo-checks.test.mjs` checks the order

## 2. Offline start

- [x] 2.1 `scripts/e2e-offline.mjs` (owner setup, synced task, service worker control, manifest, offline reload, `/api/*` not cached, offline add converging); passes against a fresh `bin/opentodo`
- [x] 2.2 `make e2e` runs it; the repository checks require it
