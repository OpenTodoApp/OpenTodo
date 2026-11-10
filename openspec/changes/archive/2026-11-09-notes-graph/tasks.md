# Tasks

## 1. The graph model and layout

- [x] 1.1 `web/src/lib/graphLayout.ts`: the two-ring neighbourhood from the `note-links` index (readable items only, caps, "+n", most recent first) with unit tests for the "Two steps", "Hub note" and "No access" scenarios; verify with `npm test -- graphLayout` in web/
- [x] 1.2 The radial layout (ring order, sectors, label placement, truncation) with a determinism test (same input, same positions) and a 360 px no-overlap test; verify with `npm test -- graphLayout` in web/

## 2. The Connections dialog

- [x] 2.1 The lazy chunk `web/src/app/connections/` (dialog, SVG renderer, Graph / List switch remembered per device) with a test that the entry's static imports do not include it (`make bundle-budget` still passes); verify with `npm test` and `npm run build` in web/
- [x] 2.2 Pointer, touch and keyboard interaction (centre, open, Back, arrows, Escape, reduced motion), interaction tests in happy-dom with `waitFor`; verify with `npm test` in web/
- [x] 2.3 Accessible names for the group and nodes, the List view with Links and Linked from, checked with the accessibility test helpers; verify with `npm test` in web/
- [x] 2.4 Story with baselines in light, dark, 375 and 1280 px (`make ui-check`) and strings in every catalogue (`make i18n-check`)

## 3. Entry points

- [x] 3.1 Show connections in the note, task and project menus (only with a link), the Graph control in the Linked references heading, and the palette command; tests that items without links do not offer it; verify with `npm test` in web/
- [x] 3.2 Time opening the dialog on the notes fixture locally (`make perf`) and record the result in the pull request against design D6's 200 ms / 600 ms

## 4. Docs and integration

- [x] 4.1 A Connections section in `docs/notes.md` and `changelog.d/Added/notes-graph.md`; verify with `make docs` and `make docs-check`
- [x] 4.2 Run `make check` and verify it passes
