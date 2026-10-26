# Tasks

## 1. Confirm the cause

- [x] 1.1 Reproduce #442 with `make dev` in Chrome: side panel preference on, at 1440 px. Open a project, open another one so the panel reads "No task selected", then click a task while recording in the Performance panel with screenshots. Note in design.md (D3) whether the recording shows the two effects: a frame without the slot (the list at full width), and the `panel-enter` fade or slide. Note any third cause there too. Verify: the recording's frames are described in design.md before any code changes. Done without an interactive recording: the 2.1 regression test reproduced both effects on `main` (one empty frame, and `panel-enter` on the docked panel). design.md D3 records the outcome, including a third, smaller case (an unknown id).

## 2. The slot stays in place while it fills

- [x] 2.1 Write the regression test first, in `web/src/app/sidePanel.test.tsx`: "the first task after changing lists never empties the slot (GitHub issue 442)". It goes to one list, then another, and waits for the empty pane. A `MutationObserver` counts the mutations after which neither `[data-split-empty]` nor a docked `[data-detail-for]` is in the document. The test then clicks a row's title and waits for the task to dock. It expects that count to be 0 and the docked aside to have no `panel-enter` class. Verify: `cd web && npm test -- sidePanel` fails on `main` for both assertions. Confirmed: the count failed (1) before 2.2, and the `panel-enter` assertion failed after 2.2 but before 2.3.
- [x] 2.2 In `web/src/app/PanelHost.tsx`, render the split's empty pane, instead of `null`, while a newly docked task is still `undefined` and nothing is held (design D1). The pane is also kept while an unknown id is about to leave. Verify: the count part of 2.1 passes; the #383 test (`switching tasks never empties the panel`) still passes.
- [x] 2.3 In `web/src/app/PanelHost.tsx`, set `enteredFor` only when the slot was not visible in the previous render, meaning neither a task nor the empty pane (design D2). Add to `web/src/app/panelMotion.test.tsx`: with the empty pane showing, docking a task has no `panel-enter`; with the panel closed, it does. Verify: `cd web && npm test -- sidePanel panelMotion` passes.
- [x] 2.4 Add a test for the "A task that does not exist" scenario, in `panelMotion.test.tsx` beside the other empty-pane case: with the empty pane showing, docking an id that isn't in the database leaves the empty pane in place and no `[data-detail-for]` appears. Verify: `cd web && npm test -- panelMotion`.
- [x] 2.5 Re-run the recording from 1.1. Verify: no frame without the slot, no fade or slide when a task fills the empty pane, and the slide-in still plays when the panel opens from closed. Also `cd web && npm run build`. Re-checked with the tests instead of a recording: every test file that renders the panel slot (11 files, 80 tests) passes three runs in a row, including "slides in from closed"; `npm run build` passes.

## 3. Release

- [x] 3.1 Add a CHANGELOG.md entry under Unreleased: "The side panel no longer flickers when the first task is chosen after changing lists" (Fixes #442). Verify: `npm run docs:check`.
- [x] 3.2 Run `make check` and `make openspec-validate`. Verify: both pass. CI ran the full suite on #458, and every job passed.
- [x] 3.3 After the PR is merged, reply on issue #442 with a short, friendly note: thank the reporter for the precise steps, explain that the panel had nothing to hold after a list change so it emptied for a moment and replayed its slide-in, and name the release that fixes it. Then close the issue. Verify: `gh issue view 442 -R OpenTodoApp/OpenTodo` shows the comment and the state CLOSED.
