## 1. Lazy

- [x] 1.1 `lib/lazy.ts`: `lazy()` and `retryFailedImports()`; vitest (fails until retried, then loads; no retry unasked)
- [x] 1.2 Every `lazy(` in web/src from `lib/lazy`; ESLint refuses `lazy` from `react`; `npm run lint`
- [x] 1.3 The five keeping loaders forget a failed load; vitest (`lazyLoaders.test.ts`)

## 2. Boundary

- [x] 2.1 `PanelBoundary` recovers an offline chunk failure on `online` (with 1, 2, 4 s retries); keeps the message otherwise; vitest
- [x] 2.2 Browser check: a second device opens a project offline, then back online the panels render without a reload

## 3. Check

- [x] 3.1 `npm test`, `npm run typecheck`, `npm run build`, `make bundle-budget` in web/; `make openspec-validate`, `make docs-check`, `make repo-check`
