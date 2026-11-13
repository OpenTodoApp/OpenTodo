# Tasks

## 1. Model and layout

- [x] 1.1 `web/src/lib/forceLayout.ts`: the deterministic force layout (spiral seed, Barnes–Hut, fixed cooling), sliced steps and the local placement of new nodes with the others fixed; unit tests for determinism and "a new node moves no other"; verify with `npm test -- forceLayout` in web/
- [x] 1.2 `web/src/lib/notesGraph.ts`: the graph of the notes list and the link index (secondary nodes, readable items only, undirected pairs), topic matching, depth around a centre, the arrow-key step, the positions kept on the device; `LinkIndex.forEachLink` in `noteLinks.ts`; unit tests for the "Notes and their links", "No access" and topic scenarios; verify with `npm test -- notesGraph` in web/
- [x] 1.3 Scale test `web/src/app/notes-graph/notesGraph.perf.test.ts` at 2,000 notes and 5,000 links (layout steps, determinism, local change, labels per frame, hit-test visits); verify with `npm run test:perf` in web/

## 2. The page

- [x] 2.1 The mode in `web/src/app/router.ts` (`/notes?view=graph`, `/notes/<id>?view=graph`, the remembered mode) with router tests; the List | Graph switch and `v` (`notes.view-mode`) in `NotesPage.tsx`; verify with `npm test -- router notesPage`
- [x] 2.2 The lazy chunk `web/src/app/notes-graph/` (canvas renderer, camera, pointer, wheel, pinch, keyboard, live region, find, topic, depth, display menu, Fit and zoom) with interaction tests in happy-dom; verify with `npm test -- notesGraph`
- [x] 2.3 Opening from the graph: the docked note and task beside it, Escape, phones' tap twice; Open in graph in Connections; tests; verify with `npm test -- notesGraph connections`
- [x] 2.4 Stories in light and dark (`data-story-pending` until drawn) and their baselines; strings in every catalogue (`make i18n-check`); `make ui-lint`

## 3. Performance and size

- [x] 3.1 The `notes-graph` and `notes-graph-frame` budgets in `scripts/perf/budgets.json` and `docs/performance.md`, measured in the notes session of `scripts/perf/run.mjs`; verify with `node --test scripts/perf/budgets.test.mjs`
- [x] 3.2 First load unchanged beyond the router's mode; verify with `make bundle-budget` and the before/after numbers in the pull request

## 4. Docs and integration

- [x] 4.1 The guide `docs/notes-graph.md` (with its screenshot), links from `docs/notes.md` and `docs/note-connections.md`, `changelog.d/Added/notes-graph-page.md`, the ROADMAP row; verify with `make docs` and `make docs-check`
- [x] 4.2 Checked in the real app with Playwright at 1280 and 390 px in light and dark on a seeded account with many linked notes (screenshots and a recording)
- [x] 4.3 `npm test`, `npm run test:perf`, typecheck, lint, `make ui-lint`, `make i18n-check`, `make openspec-validate`, `make docs-check`, `make bundle-budget`, `node --test scripts/repo-checks.test.mjs`
