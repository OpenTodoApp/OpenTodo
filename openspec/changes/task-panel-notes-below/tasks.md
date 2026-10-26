# Tasks

## 1. The panel: properties first, the whole note

- [x] 1.1 In `web/src/app/task-detail/TaskDetail.tsx`, reorder the panel body to `TaskRelations`, `Facets`, `FieldsGroup`, `Subtasks`, `AttachmentsRow`, `TaskNotes`, then `ConversationTabs` (design D1). Verify: a new test in `web/src/app/task-detail/taskDetail.test.tsx` renders a task with a note, a subtask and an attachment, and asserts that the order inside `[data-panel-body]` is facets, subtasks, attachments, notes, tabs. Run `cd web && npm test -- taskDetail`.
- [x] 1.2 Remove the clamp (design D2): `NotesClamp`, `NOTES_CLAMP_LINES` and the `clamp` prop in `TaskNotes.tsx`, the re-export in `TaskDetail.tsx:27`, and the `.notes-clamp` rule in `web/src/index.css:755`. Verify: `grep -rn "NOTES_CLAMP\|notes-clamp\|data-notes-show-all" web/src` returns nothing. A test in `web/src/app/task-detail/notes.test.tsx` renders a forty-line note in the panel and finds the last line in the DOM, no `[data-clamped]` and no Show all control. `cd web && npm test && npm run build` pass.
- [x] 1.3 Update `web/src/app/task-detail/panel.stories.tsx` (`Task/Panel`): its hand-built `FullTask`, `EmptyTask`, `Viewer` and `NotesEditing` stories follow the new order. Add a `LongNote` story with a forty-line note and two subtasks. Verify: `make ui-check` runs the story under the accessibility gate. Update the changed baselines after inspecting the diffs: only the panel order moves.

## 2. The task page below 1024 px

- [x] 2.1 In `TaskPageView.tsx`, split the content block into the head (title and relations) and the notes block (notes and Attach), and place the facts `aside` between them in the DOM. Keep the `lg:` column-2 placement, sticky, now spanning one more row (design D3). Verify: a test in `web/src/app/shell.test.tsx` (where the page renders through the router) asserts the DOM order head → `[data-task-facts]` → notes block → rest.
- [x] 2.2 Check the page stories and the layout check at 375, 768 and 1280 px: at 1280 px the facts column is still beside the notes and sticky; below 1024 px the facts card is above the notes. Verify: the task page Storybook baselines at 1280 px are unchanged, and only the 768 and 375 px ones change (inspected). `make layout-check` passes.

## 3. Budget and docs

- [x] 3.1 Confirm the scroll-region budget on the project screen with the panel open on a long note. Verify: `make layout-check` passes with at most 3 vertical scroll regions. The panel-open overlays (`task-history` and the rest in `scripts/ux-audit/layout-screens.mjs`) use a seeded task whose note is long enough to exceed the panel; add such a note to the seed if none exists.
- [x] 3.2 Update `docs/task-panel.md`: the panel lists the facts, subtasks and attachments, then the notes in full, then the conversation, and narrow pages show the facts above the notes. Regenerate the help (`make docs`). Verify: `npm run docs:check`.
- [x] 3.3 Add a CHANGELOG.md entry under Unreleased: "The task panel shows a task's properties first and its notes in full below them, without Show all (#444)". Verify: `npm run docs:check`.

## 4. Release

- [ ] 4.1 Run `make check` and `make openspec-validate`. Verify: both pass.
- [ ] 4.2 After the PR is merged, reply on issue #444 with a short, friendly note: properties first, notes in full below them, no Show all, and why the notes grow with the panel instead of scrolling on their own (the three-scroll-region budget). Name the release, then close the issue. Verify: `gh issue view 444 -R OpenTodoApp/OpenTodo` shows the comment and the state CLOSED.
