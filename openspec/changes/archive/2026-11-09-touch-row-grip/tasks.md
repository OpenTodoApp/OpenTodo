# Tasks

## 1. The grip

- [x] 1.1 `RowGrip` in `web/src/app/TaskRow.tsx`: right edge of the row, rendered only where a coarse pointer is primary, `touch-action: none`, `user-select: none`, a 44 px target and `aria-pressed`; wired through the `onGripDown` / `onGripClick` props
- [x] 1.2 The `grip` / `gripTap` entries of the stable `RowActions` in `web/src/app/task-list/TaskListRow.tsx`, handled in `useListBindings.ts`: a tap ticks (or unticks) and enters Select mode with one haptic pulse, a hold does the same through the drag
- [x] 1.3 Grip mode in `beginDrag` (`web/src/lib/dnd.ts`): movement lifts at once without waiting for the hold, a held release never opens the menu; `startDrag(e, task, grip)` in `useListDrag.ts` passes it and wires `onHold` (hold-select) to the grip only

## 2. The row body's hold becomes the menu's

- [x] 2.1 Drop the `finePointer()` rule from `beginDrag` and `holdForRow` and remove the now-unused helper; stop wiring the body hold to `holdSelect` in `TaskListView.tsx`, so the body's hold only arms and opens the menu on every pointer
- [x] 2.2 Stop a held row from selecting words: coarse-pointer `user-select: none` on `li[data-task-id]` in `web/src/index.css`, with form controls inside a row exempt so the inline editor still selects its text
- [x] 2.3 Draw the selection box ourselves: the `.row-tick` rule (appearance none, 20 px, 4 px radius, accent fill and tick when checked) so it fills the same slot as the completion circle on every device

## 3. Tests

- [x] 3.1 `web/src/lib/dnd.test.ts`: the hold opens the menu on a coarse pointer; the grip's tap, hold and immediate drag
- [x] 3.2 `web/src/app/rowSwipe.test.tsx`: grip hold and grip tap select; the body's hold never ticks
- [x] 3.3 `web/src/app/task-row-contextmenu.test.tsx`: a phone's hold arms and opens the menu
- [x] 3.4 `web/src/app/taskRow.test.tsx`: the grip renders only where a coarse pointer is primary
- [x] 3.5 `npm run typecheck`, `eslint` and `TZ=UTC npx vitest run` pass

## 4. Spec, docs and delivery

- [x] 4.1 This change's deltas (`action-menus`, `bulk-actions`) written against the current specs; `make openspec-validate` passes strict
- [x] 4.2 Docs: one sentence each in `docs/work-from-the-list.md` and `docs/keyboard.md`; CHANGELOG entry; `make docs-check` passes
- [x] 4.3 Full gates after the rebase onto `upstream/main`: typecheck, lint, tests, layout check
