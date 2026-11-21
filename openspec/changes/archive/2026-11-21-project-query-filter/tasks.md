# Tasks

## 1. The filter on a project

- [x] 1.1 `useListModel` gives a project route its own query filter (`project.filter.<id>`); the chrome shows Filter…, the chip and the dialog named after the project. Verify: `projectQueryFilter.test.tsx` (list and board narrowed, one filter per project, cleared by the chip).
- [x] 1.2 The dialog's hint gives `search:` first, in every locale. Verify: `make i18n-check`.

## 2. Release

- [x] 2.1 Docs and a changelog fragment. Verify: `make docs-check`, `make repo-check`.
- [x] 2.2 `npm test` and `npm run build` in web/. Verify: both pass.
