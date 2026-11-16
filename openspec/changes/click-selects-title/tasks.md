# Tasks

## 1. The rule

- [ ] 1.1 `useRowClicks` in `web/src/app/TaskRow.tsx` records at `pointerdown` (mouse or pen) whether the row was the selected row, and the click reads it: not selected, select (and dock where the side panel or the Inbox's split shows); selected and on the title, ask for the inline editor; selected and on the empty area, nothing. A click without that press (Enter, Space, an assistive technology's activation) opens the task as Enter does; Shift and Ctrl/⌘ clicks and Select mode tick as before; a drag's click stays swallowed. Verify: interaction tests (happy-dom, `waitFor`) in `web/src/app/task-list/clickSelects.test.tsx` (replacing `rowClickModes.test.tsx`) for each scenario of `task-list-presentation` "A click selects the row, a second click edits its title": first click, second click, keyboard-selected row, empty area, drag, Ctrl+click, screen-reader activation (`click()` with no press), Enter; `npm test -- clickSelects` in web/.
- [ ] 1.2 `startInline` in `web/src/app/TaskListView.tsx` drops the preference and the "no task docked, no Inbox split" condition; `RowActions.open` in `task-list/useListBindings.ts` selects on a pointer click and opens only for a click without a press. Verify: `inlineEditor.test.tsx` updated (Fix a typo starts from a selected row; edit beside the side panel, in the Inbox split; viewer; phone); the existing `sidePanel.test.tsx` and `inboxSplit.test.tsx` pass with their click scenarios moved to the rule; `npm test` in web/.
- [ ] 1.3 The double-click: on an unselected row the page opens with no editor shown; on the selected row the editor closes unchanged and the page opens; a word is selected in a title already being edited. Verify: tests in `clickSelects.test.tsx`; `npm test -- clickSelects` in web/.
- [ ] 1.4 Board cards, the Filter view, saved views, Next and Waiting select on a first click (`openFromRow` in `sidePanel.tsx` docks or does nothing for a pointer click, opens for a click without a press); Enter and the double-click open. Verify: tests for a board card, a Filter view result, a saved view row and a Next row with the page preference and with the side panel in `clickSelects.test.tsx`; `npm test` in web/.
- [ ] 1.5 Touch and below 768 px: a tap and a narrow click open the task as before. Verify: tests with a coarse pointer and a 390 px window in `clickSelects.test.tsx`.
- [ ] 1.6 The following list keeps its cost: one list render and two row renders per later `j`/`k` and per first click beside the side panel at 2,000 rows. Verify: `npm run test:perf -- sidePanelFollow` in web/.

## 2. `a` after a click

- [ ] 2.1 Click then `a` opens the add-subtask line under the row in Today, a project and the Inbox, with the page preference and with the side panel; `a` while editing a title types; `a` on a board card is unhandled (`list.add-subtask` returns `false` when `c.board`). Verify: tests in `web/src/app/task-list/clickSelects.test.tsx`; `npm test` in web/.

## 3. The setting goes

- [ ] 3.1 Remove the "Click a task to" row from `PreferencesPanels.tsx` (`KeyboardSection`, `KeyboardView`) and `lib/settingsCopy.ts`; `rowClick.ts` keeps only `DOUBLE_CLICK_MS` (`RowClick`, the store and `clickExpands` go); a stored `opentodo.rowClick` is ignored. Verify: a test that a device with `opentodo.rowClick` set to `open` or `expand` follows the rule, and the Keyboard section test lists three rows; `npm run typecheck` and `npm test` in web/.
- [ ] 3.2 Catalogues: remove "Click a task to", its description and "Expand the row"; the `F2` description in `lib/shortcuts.ts` adds "or click the title of the selected task"; the sample note in `lib/sampleTasks.ts` reads "Double-click a task to open it. …"; every language. Verify: `make i18n-check`.

## 4. Tests that clicked to edit or to open

- [ ] 4.1 `scripts/e2e-smoke.mjs` stops setting `opentodo.rowClick` and opens tasks with Enter or a double-click where it clicked; the UX audit's `inline-editor` overlay in `scripts/ux-audit/layout-screens.mjs` clicks the title twice (select, then edit); the comments in `web/src/app/taskRow.stories.tsx`. Verify: `make e2e` (the smoke flows), `make layout-check`, `make ui-check`.

## 5. Docs and checks

- [ ] 5.1 `docs/task-panel.md`, `docs/expand-a-row.md`, `docs/settings-app.md` (with the note for people who chose a setting), `docs/sidebar-schedule.md`, `docs/process-the-inbox.md`; `changelog.d/Changed/click-selects-title.md`; the change's ROADMAP.md row marked shipped. Verify: `make docs` and `make docs-check`.
- [ ] 5.2 The first load stays within `web/bundle-budget.json` without raising it. Verify: `npm run build` in web/ and `make bundle-budget`.
- [ ] 5.3 Typecheck, lint, `make ui-lint`, `make openspec-validate`, `node --test scripts/repo-checks.test.mjs`, `npm test` in web/, and `make check` before the last task is ticked.
