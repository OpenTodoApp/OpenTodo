## 1. Opening a task as a page

- [x] 1.1 The trail (D2): `taskTrail.ts` (open, step, leave, settle, scroll restore); the shell's route effect calls `settleTrail`; verify `taskPage.test.tsx`
- [x] 1.2 One entry point (D3): `openTaskPanel` opens the page unless the page keeps a split (`setTaskSplit`), Process the Inbox keeps it; outside openers (`openTaskInList`, notifications) name the task's list; verify `shell.test.tsx` and `triageView.test.tsx`
- [x] 1.3 `?task=` addresses open the page over the page in the address; Copy link copies `/task/<id>` (D4); verify `taskPage.test.tsx`
- [x] 1.4 Shortcuts `task.next`, `task.prev`, `task.escape` in the registry with their overrides; verify `shortcuts.test.ts`

## 2. The page

- [x] 2.1 Shared model and parts (D5): `useTaskDetail`, `TaskHead`, `TaskNotes`, `Subtasks`, `TaskActionsMenu`; `TaskDetail` is the docked panel only; `TaskSheet` deleted
- [x] 2.2 `TaskPageView` (D1): breadcrumb header, place in the list and stepper, Close, content and facts columns, phone bar with Back
- [x] 2.3 `TaskFacts` (D7) with `useFacetParts` and `usePartEditor` from `Facets`; the budget's fact groups in `budget.json`; verify `budget.test.tsx`
- [x] 2.4 `ComposerFrame` (D6) in `ui/patterns`, used by the comment composer; verify `commentsTab.test.tsx` and `richComposer.test.tsx`
- [x] 2.5 New strings in the five catalogs; verify `make i18n-check`

## 3. Tests, docs and baselines

- [x] 3.1 Update the unit tests that followed the panel (shell, tab bar, inline editor, list, calendar, plan, month, review, palette, bulk, time tracking, dependencies, deadlines, someday, motion) and the e2e and screenshot scripts' selectors
- [x] 3.2 Stories: the shell's and the phone's task page stories, `TaskFacts` and `ComposerFrame` in the workbench
- [x] 3.3 Update `docs/interface-guide.md` and the task panel help, and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 3.4 Regenerate the visual baselines in the pinned Playwright image; verify `make ui-check` in CI
- [x] 3.5 Run `make check` with TZ=UTC, open the pull request and get CI green
