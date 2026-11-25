## 1. Indicator

- [x] 1.1 `useRunning` marks the entry of the running Focus work stretch; the footer pill's body and the icon rail menu go to Focus for it, and open the task otherwise (vitest `src/app/timeTracking.test.tsx`)
- [x] 1.2 The bar's pill below 768 px goes to Focus for the session's entry and keeps the sheet otherwise (vitest `src/app/timeTracking.test.tsx`)
- [x] 1.3 The new name "Go to Focus: {text}" in `messages.json` and every shipped catalog (`make i18n-check`)

## 2. Check

- [x] 2.1 The time-tracking and sidebar footer tests, eslint on the changed files and `tsc --noEmit` in web/, `make i18n-check`, `make docs-check`, `openspec validate --all --strict`
