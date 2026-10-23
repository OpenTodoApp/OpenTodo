# Tasks

## 1. Row empty area opens the panel

- [x] 1.1 Add the `<li>` click handler in `FullRow` (`web/src/app/TaskRow.tsx`) per design D1: ignore clicks inside the row's interactive elements, tick on Shift/Ctrl/⌘, otherwise call `onOpen()` with no event; none for the inline editor's row or a departing row; verify with new tests in `web/src/app/taskRow.test.tsx` (empty-area click opens under both preferences, the checkbox and chevron keep their actions, modifier ticks) and `npm test -- taskRow`
- [x] 1.2 Check that a drag and a swipe ending on the empty area do not open the task (the click is swallowed by `lib/dnd.ts` and `rowSwipe.ts`); verify with a test that a drag release on a row does not call `onOpen`, and `npm test -- taskRow rowSwipe dnd`
- [x] 1.3 Update `docs/work-from-the-list.md` or the guide that describes clicking a task, and the interface guide's row anatomy, with the empty-area rule; verify `make docs-check`

## 2. Pointer on clickable elements

- [x] 2.1 Add the zero-specificity base cursor rule to `web/src/index.css` (design D2); verify with a token test that reads `index.css` and finds the rule and its selectors (`npm test -- tokens`)
- [x] 2.2 Add the `cursorDefault` style lint to `web/src/ui/tokens/styleLint.ts` (fails on `cursor-default`/`cursor-auto` without `cursor-lint-allow` and a reason) with cases in `lint.test.ts`, wire it into `make ui-lint`; verify `npm test -- lint` and `make ui-lint`
- [x] 2.3 Remove hand-added `cursor-pointer` that the base rule now covers (buttons, `role=button`, `summary`, links), keeping it on plain elements the selector cannot see; verify `npm test` and `npm run build`
- [x] 2.4 Document the rule in `docs/design-system.md`; verify `make docs-check`

## 3. Empty views without the duplicate button

- [x] 3.1 Remove the `'add'` action from list empty views in `web/src/app/task-list/ListChrome.tsx` and the `addFromEmpty` path in `TaskListView.tsx`; keep "Open Inbox", "Open Today", the secondary links, and the board, calendar, Plan and onboarding "Add a task" buttons; verify with updated tests (`npm test -- listChrome emptyStates taskList`)
- [x] 3.2 Regenerate the visual baselines that change, in the pinned Playwright image; verify `make ui-check` in CI

## 4. Wrap-up

- [x] 4.1 CHANGELOG entry under Unreleased (Changed: the row's empty area, the hand cursor, empty views); verify by reading it
- [x] 4.2 Run `make check` with TZ=UTC; verify it passes
  - Done: every target passes locally except one load flake in `attachmentsRow.test.tsx` (3/3 alone, untouched here); CI on #277 is green (26 passed, 3 skipped).
