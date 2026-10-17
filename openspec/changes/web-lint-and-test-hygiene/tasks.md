# Tasks

## 1. Hooks lint (UI-14)

- [x] 1.1 Add eslint, typescript-eslint and eslint-plugin-react-hooks (exact versions) and `web/eslint.config.js`; `npm run lint` and `make web-lint` in `make check` — verified by `make web-lint` passing and `web/scripts/eslint-config.test.mjs` (a missing dependency, a conditional hook and a stale suppression fail; a suppression with a reason passes).
- [x] 1.2 Fix or justify every finding and review every existing suppression (StatsView, ReviewView, SavedViewView memos fixed; Properties' stale suppression removed; reasons on the rest) — verified by `npm run lint` with `--max-warnings 0`.

## 2. Hermetic, stable tests (UI-15)

- [x] 2.1 Global fetch stub in `web/src/test-setup.ts` that fails the test on an unmocked request; `mockFetch`/`noPublicLinks` in `ui/test-utils.tsx`; mock the public-links lookup in the seven files that rendered a project header — verified by `npx vitest run` printing no `ECONNREFUSED`.
- [x] 2.2 Shared `waitFor` in `ui/test-utils.tsx`; replace fixed sleeps in the tests that failed under load (appearance, density, budget, shell, somedayViews, timelineView, task-detail priority, propertyChips, whenControl, taskDetail pickers, the task-detail test kit), best-of-three for the palette budget, 30 s test timeout — verified by three full runs at `--maxWorkers=10` on four cores with no failure.
- [x] 2.3 A revealed chip leaves the revealed set when its editor closes, so clearing its value removes it — verified by `propertyChips.test.tsx` "Add then Estimate with a value …".

## 3. Service worker clock (DATA-12 follow-up)

- [x] 3.1 Store the clock offset in `meta` after each sync and seed it at start — verified by `clockSkew.test.ts` "is saved after a sync for the service worker and seeds the clock at the next start".
- [x] 3.2 `push-sw.js` stamps with the stored offset and keeps refused ops (and every op on a non-sync answer) queued — verified by `pushWorker.test.ts` "stamps its ops with the app’s stored offset to server time", "keeps ops the server refused queued for the app’s next sync", "keeps every op queued when the answer is not the server’s".

## 4. Checks

- [x] 4.1 `npx tsc -b`/`npm run typecheck`, `npm test`, `npm run build`, `make ui-lint`, `make i18n-check`, OpenSpec validation.
