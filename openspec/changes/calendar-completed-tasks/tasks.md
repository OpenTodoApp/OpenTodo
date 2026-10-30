# Tasks

## 1. Calendar visibility and header control

- [x] 1.1 Add the default-off local visibility preference, shared button and optional completed-task selection in all four modes; verify selector/preference coverage and default/on/off behavior in calendar interaction tests.
- [x] 1.2 Render struck-through, accessibly marked completed titles in Day/Week blocks, lanes, overflow and phone agenda, Month cells and phone list, and Plan compact rows; guard completed/hidden selections against calendar writes, verified by interaction tests for gestures, keys and opening details.
- [x] 1.3 Translate button text in every shipped catalog, regenerate message locations, document scheduled-date display and capacity in docs/calendar-views.md and CHANGELOG.md, and regenerate help; verify `make i18n-check docs-check`.

## 2. Integration and contribution checks

- [x] 2.1 Verify cross-mode persistence and reloads, phone layouts, live completion/reopening, zoned dues, overflow, unchanged capacity and recurring projections; run `npm test` and `npm run build` in web/ and `make bundle-budget`.
- [x] 2.2 Run browser smoke and calendar layout/accessibility checks, capture affected core screens before/after at desktop/phone widths in light/dark, and review the images; deliver the screenshots with the PR.
- [ ] 2.3 Run `make check` and `make openspec-validate`, review the final diff, then commit and publish the feature branch to the fork and open an English PR using the repository template, linking #624, the OpenSpec folder, validation and screenshots.
