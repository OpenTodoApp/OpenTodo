## 1. Frames at the left edge

- [x] 1.1 Put both page frames at the content column's left edge (D1): `.page-frame { margin-left: 0; margin-right: auto }` in `web/src/index.css`, `PAGE_FRAME` without `mx-auto`, and the Settings section page's container without `mx-auto`; verify the measurement table in design.md shows 0 px of movement at 1024, 1280, 1440, 1920 and 2560 px
- [x] 1.2 Remove the frame slide (D2): `web/src/ui/patterns/frameSlide.ts`, its export and its use in `PageHeader.tsx` and `TaskListView.tsx`, and the slide tests in `pageRhythm.test.tsx`; verify `npx tsc -b` and `npx vitest run src/ui/patterns` pass
- [x] 1.3 Give the docked panel one width (D3): `--panel-w` in `index.css` (26 rem, 30 rem from 1440 px) and `lg:w-(--panel-w)` in `TaskDetail.tsx` and `PanelFrame.tsx`; verify the panel measures 480 px at 1920 px and a unit test pins both values

## 2. Tests and docs

- [x] 2.1 Extend the frame step of `scripts/e2e-views.mjs` (D4): the first visible row and the title with the panel closed, open and closed again on Today and a project at 1280, 1440 and 1920 px, and one left edge for Today, Labels and a project at 2560 px; verify `node scripts/e2e-views.mjs` passes against a fresh server
- [x] 2.2 Update `docs/interface-guide.md` (the page frames) and add the CHANGELOG entry under Unreleased → Fixed; verify `make docs-check`
- [x] 2.3 Regenerate the visual baselines that change in the pinned Playwright image; verify `make ui-check` (in CI)

## 3. Integration

- [x] 3.1 Run `make check` with `TZ=UTC`, open the pull request and get CI green
