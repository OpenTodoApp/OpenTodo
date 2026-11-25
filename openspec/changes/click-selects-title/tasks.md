# Tasks

## 1. The rule

- [x] 1.1 `useRowClicks` in `web/src/app/TaskRow.tsx` records at `pointerdown` (mouse or pen) whether the row was the selected row, and the click reads it: not selected, select (and dock where the side panel or the Inbox's split shows); selected and on the title, ask for the inline editor; selected and on the empty area, no editor, but the row shows beside the list as on a first click (`row-edit-action` D3). A click without that press (Enter, Space, an assistive technology's activation) opens the task as Enter does; Shift and Ctrl/⌘ clicks and Select mode tick as before; a drag's click stays swallowed. Verify: interaction tests (happy-dom, `waitFor`) in `web/src/app/task-list/clickSelects.test.tsx` (replacing `rowClickModes.test.tsx`) for each scenario of `task-list-presentation` "A click selects the row, a second click edits its title": first click, second click, keyboard-selected row, empty area, drag, Ctrl+click, screen-reader activation (`click()` with no press), Enter; `npm test -- clickSelects` in web/.
- [x] 1.2 `startInline` in `web/src/app/TaskListView.tsx` drops the preference and the "no task docked, no Inbox split" condition; `RowActions.open` in `task-list/useListBindings.ts` selects on a pointer click and opens only for a click without a press. Verify: `inlineEditor.test.tsx` updated (Fix a typo starts from a selected row; edit beside the side panel, in the Inbox split; viewer; phone); the existing `sidePanel.test.tsx` and `inboxSplit.test.tsx` pass with their click scenarios moved to the rule; `npm test` in web/.
- [x] 1.3 Preserve double-click to open, including the second click whose press begins on a row selected by the first click. Opening from an already-selected title leaves the title unchanged. Double-click inside an established editor still selects a word. Verify: `npm test -- clickSelects` in web/.
- [x] 1.4 Board cards, the Filter view, saved views, Next and Waiting select on a first click (`openFromRow` in `sidePanel.tsx` docks or does nothing for a pointer click, opens for a click without a press); Enter and the double-click open. Verify: tests for a board card, a Filter view result, a saved view row and a Next row with the page preference and with the side panel in `clickSelects.test.tsx`; `npm test` in web/.
- [ ] 1.5 Keep title taps opening on touch. A short left swipe edits the title on release and a full left swipe opens Schedule. Verify the thresholds, focused editor and right swipe with `npm test -- rowSwipe clickSelects inlineEditor` in web/. Verify the single-row menu, Save and Cancel at 390 px in Chromium and WebKit and the iOS keyboard on a device during review.
  Browser emulation confirmed focus on release, Save, Cancel, the full swipe to Schedule and title taps in Chromium and WebKit. The iOS software keyboard still needs a physical device check.
- [x] 1.6 The following list keeps its cost: one list render and two row renders per later `j`/`k` and per first click beside the side panel at 2,000 rows. Verify: `npm run test:perf -- sidePanelFollow` in web/.

## 2. `a` after a click

- [x] 2.1 Click then `a` opens the add-subtask line under the row in Today, a project and the Inbox, with the page preference and with the side panel; `a` while editing a title types; `a` on a board card is unhandled (`list.add-subtask` returns `false` when `c.board`). Verify: tests in `web/src/app/task-list/clickSelects.test.tsx`; `npm test` in web/.
- [x] 2.2 Verify Enter in the editor saves an existing nested title and creates no task or add line. Verify **Add task below** still creates same-parent siblings and Add subtask still creates children, with the respective fields retaining focus. Re-run `npm test -- inlineEditor addBelow subtaskAddLine` in web/. Check that contextual Today rows retain the eligibility rules from #1472.

## 3. The setting goes

- [x] 3.1 Remove the "Click a task to" row from `PreferencesPanels.tsx` (`KeyboardSection`, `KeyboardView`) and `lib/settingsCopy.ts`; `rowClick.ts` keeps only `DOUBLE_CLICK_MS` (`RowClick`, the store and `clickExpands` go); a stored `opentodo.rowClick` is ignored. Verify: a test that a device with `opentodo.rowClick` set to `open` or `expand` follows the rule, and the Keyboard section test lists three rows; `npm run typecheck` and `npm test` in web/.
- [x] 3.2 Catalogues: remove "Click a task to", its description and "Expand the row"; the `F2` description in `lib/shortcuts.ts` adds "or click the title of the selected task"; the sample note in `lib/sampleTasks.ts` reads "Double-click a task to open it. …"; every language. Verify: `make i18n-check`.

## 4. Tests that clicked to edit or to open

- [x] 4.1 Update the smoke and UX audit openers to select, edit or open as needed, including the title menu on touch. Capture before/after in light and dark for desktop list, side panel or Inbox split, and the compact touch editor. Refresh affected story baselines against the integration base. Verify: `make e2e`, `make layout-check`, `make safe-area-check` and `make ui-check`.

## 5. Docs and checks

- [ ] 5.1 `docs/task-panel.md`, `docs/expand-a-row.md`, `docs/settings-app.md` (with the note for people who chose a setting), `docs/sidebar-schedule.md`, `docs/process-the-inbox.md`; `changelog.d/Changed/click-selects-title.md`; the change's ROADMAP.md row marked shipped. Verify: `make docs` and `make docs-check`.
- [x] 5.2 The first load stays within `web/bundle-budget.json` without raising it. Verify: `npm run build` in web/ and `make bundle-budget`.
- [x] 5.3 Typecheck, lint, `make ui-lint`, `make openspec-validate`, `node --test scripts/repo-checks.test.mjs`, `npm test` in web/, and `make check` before the last task is ticked.
