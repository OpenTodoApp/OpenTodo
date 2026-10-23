## 1. Brief and lint

- [x] 1.1 Write the art brief (design D1–D5): the open-loop motif, two weights, the surface fill, the accent outline, the stage and the six motifs; verify by review of design.md
- [x] 1.2 Extend `illustrationProblems` in `scripts/ui-check.mjs` with the two stroke weights, the allowed fills and at most one accent shape, with cases in `scripts/ui-check.test.mjs`; verify `node --test scripts/ui-check.test.mjs` and `node scripts/ui-check.mjs` pass

## 2. Drawings

- [x] 2.1 Redraw `InboxZero`, `TodayClear`, `WeekClear`, `ProjectNew`, `DayDone` and `TrashEmpty` in `web/src/ui/illustrations/` to the brief, each under 4 KB; verify `make ui-lint`
- [x] 2.2 Render all six at 1× and 2× in light and dark for the eight accents and compare them with the previous set, iterating until each reads clearly (the notebook was redrawn lying flat after it read as a briefcase); verify by looking at the renders
- [x] 2.3 Add a workbench story showing the set in every accent theme; regenerate the illustration and empty-state baselines in the pinned Playwright image; verify `make ui-check` in CI

## 3. Docs and release

- [x] 3.1 Update `docs/design-system.md` "Illustrations" (the style list and the brief table) and add the CHANGELOG entry under Unreleased; verify `make docs-check`
- [ ] 3.2 Run `make check` with TZ=UTC, open the pull request with a before/after and get CI green
