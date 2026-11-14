# Tasks

## 1. Web app

- [x] 1.1 `offersQuickAdd` in `web/src/app/router.ts`: for the `review` view only the Daily check and the Monthly look offer quick add. Verify: `npx vitest run src/app/quickAddRoutes.test.ts` (`/review`, `/review/sweep` and `/review/close` have no add button; `/review/daily`, `/review/monthly` and `/triage` keep it), `npx tsc --noEmit`, `npx eslint` on the changed files.

## 2. Audit

- [x] 2.1 M11 (`overlaps` in `scripts/ux-audit/audit-measures.mjs`) compares the add button with a primary button although only one is fixed. Verify: `node --test scripts/ux-audit/measure.test.mjs` (the button on a primary action fails, beside it passes; fixed chrome over other content still passes).
- [x] 2.2 The tour at 360 px (light, English) over every screen reports no M11 finding that names the add button. Verify: `WIDTHS=360 THEMES=light LANGS=en node scripts/ux-audit/tour.mjs`, then the M11 records of `report.json`.

## 3. Checks in a browser

- [x] 3.1 Built app, seeded account, Chromium at 360 × 740 and 390 × 844 with touch, each page as it opens and at the end of its scroll. Before: the add button and "Next: Mind sweep" share 56 × 39 px at 360 px. After: the Weekly review (first step, Mind sweep, Projects, Someday) has no add button at either width; Close the day, Focus, the routine editor and Import have none as before; on the Daily check, the Monthly look, Process the Inbox, the Loop home and the Plan no primary button is under it; the Inbox, Today and a project keep it. Verify: the measured boxes of the add button against every control of the page.
- [ ] 3.2 On a phone, in the Android and the iOS app: the Weekly review shows no add button and Next takes the tap at its right end; the button is back in the Inbox.

## 4. Docs and release

- [x] 4.1 `docs/interface-guide.md` (the phone's bottom chrome) and `docs/design-system.md` (M11). Verify: `make docs`, `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Fixed/phone-fab-clearance.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [ ] 4.3 Re-baseline the phone-width UI screenshots of the Weekly review (the layout check's `review` screen below 768 px).
