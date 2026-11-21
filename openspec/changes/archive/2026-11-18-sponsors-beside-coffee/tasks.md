## 1. App

- [x] 1.1 `SponsorLink` after `CoffeeButton` in the welcome note and in Settings → About; the settings search keywords. Verify `cd web && npx vitest run src/app/welcomeDialog.test.tsx`.
- [x] 1.2 The message "Or sponsor on GitHub" in every shipped catalog (the Polish one flagged for its maintainer). Verify `make i18n-check`.

## 2. Docs

- [x] 2.1 `docs/feedback-and-support.md` names GitHub Sponsors after the coffee. Verify `make docs-check`.
- [x] 2.2 Changelog fragment `changelog.d/Added/sponsors-beside-coffee.md`. Verify `make repo-check`.

## 3. Checks

- [x] 3.1 `cd web && npm test && npm run build`, `make openspec-validate`, and the UI visual check with new baselines for the welcome note and About. Verify all pass.
