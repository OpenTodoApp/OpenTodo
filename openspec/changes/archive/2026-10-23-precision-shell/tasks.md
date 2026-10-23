## 1. Shell and page heads

- [x] 1.1 The inset content surface (D3): `<main>` as the surface from 768 px on the canvas, the sidebar without its right border; verify the shell renders and the sidebar and shell tests pass
- [x] 1.2 Full width (D3): remove the frame widths, the standalone gutter and the project frame from `index.css` and `max-w-[80rem]` from `PAGE_FRAME`; a form keeps its fields at 42 rem; verify `pageRhythm.test.tsx`
- [x] 1.3 Two heads (D1): `PageHeader` `kind` and `briefing`; Today and Upcoming as day pages in `TaskListView.tsx`; verify the page-rhythm tests for both heads
- [x] 1.4 The sidebar toggle (D2): `ui/patterns/sidebarToggle.ts`, registered by the shell, rendered first in every header from 1024 px; the footer's control only on the collapsed rail; verify the sidebar and footer tests
- [x] 1.5 Key sequences in tooltips (D4): `KeySequence` in `Tooltip.tsx`, `Go to {page}` tooltips on the sidebar destinations, the strings in the five catalogs; verify `make i18n-check`
- [x] 1.6 Neutral active sidebar row (D5); verify the sidebar tone test

## 2. Docs, tests and baselines

- [x] 2.1 Update `docs/interface-guide.md` (the page template and frames) and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 2.2 Regenerate the visual baselines in the pinned Playwright image; verify `make ui-check` in CI
- [x] 2.3 Render Today, a project and Settings from the real app at 1440×900 in dark next to the round-2 mock-ups and attach the side-by-side to the pull request
- [x] 2.4 Run `make check` with TZ=UTC, open the pull request and get CI green; the layout and e2e checks pass under full width
