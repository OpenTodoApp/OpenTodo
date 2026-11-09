# Tasks

## 1. Click a task to

- [x] 1.1 `RowClick` gains `expand` (stored, `edit` not stored), `clickExpands` decides in `TaskRow` for a pointer click on a row that can expand; the select offers Edit in place, Open details and Expand the row; interaction tests (happy-dom, `waitFor`) for each choice, Enter still opening and the board fallback in `web/src/app/task-list/rowClickModes.test.tsx`; verify with `npm test -- rowClickModes` in web/
- [x] 1.2 The setting's description and the new choice in every catalogue; verify with `make i18n-check`

## 2. Double-click

- [x] 2.1 `onOpenPage` on `TaskRow`, wired by the task lists (`RowActions.openPage`), the Filter view, saved views, Next and Waiting; the second click of a double-click is ignored; controls keep their meaning; a title already being edited selects a word; tests for each choice, beside the side panel, on the empty area, on the checkbox and in the editor in `rowClickModes.test.tsx`; verify with `npm test` in web/

## 3. Details follow the selection

- [x] 3.1 The list subscribes to `usePanelHasTask` and reads the docked id where it acts (`watchPanelTaskId` for the two effects); tests that the panel follows j, k and clicks in Today, a project, a label and the Inbox with focus on the list, Expand the row beside an open and a closed panel, and the Inbox split unchanged, in `rowClickModes.test.tsx`; the existing `sidePanel.test.tsx` and `inboxSplit.test.tsx` pass; verify with `npm test` in web/
- [x] 3.2 The 2,000-row budget beside the side panel: at most two row renders and one list render per later `j`/`k` in `web/src/app/sidePanelFollow.perf.test.tsx`; verify with `npm run test:perf -- sidePanelFollow` in web/

## 4. Docs and checks

- [x] 4.1 `docs/task-panel.md`, `docs/expand-a-row.md`, `docs/settings-app.md`, `changelog.d/Added/row-click-modes.md`, the change in ROADMAP.md; verify with `make docs` and `make docs-check`
- [x] 4.2 The first load stays within `web/bundle-budget.json` without raising it; verify with `npm run build` in web/ and `make bundle-budget`
- [x] 4.3 Typecheck, lint, `make ui-lint`, `make openspec-validate`, `node --test scripts/repo-checks.test.mjs` and `npm test` in web/ pass
