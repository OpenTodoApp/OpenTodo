# Tasks

## 1. Line splitting

- [x] 1.1 Add `splitPastedLines(text)` in `web/src/lib/pasteLines.ts` (design D2): newline kinds, trim, blank lines, the list markers, marker-only lines, whitespace collapse; verify with `web/src/lib/pasteLines.test.ts` (one case per marker, `[x]` kept open, CRLF, 0/1/2/101 lines) under `npm test`

## 2. Batch create

- [x] 2.1 Add `createTasks(inputs)` to `web/src/lib/ops.ts`: plan every task with `planTask` plus its quick-add reminders and time entries, write all in one `mutateMany`, return the ids in order; verify in `web/src/lib/ops.test.ts` that positions increase in input order, one outbox upload holds every op, and an over-long encrypted title refuses the whole batch
- [x] 2.2 Undo for a created batch through the shared bulk toast ("{count} tasks added" with Undo tombstoning the tasks and their reminders in one batch); verify with a test that one Undo leaves no live task of the batch

## 3. Quick add offer

- [x] 3.1 Intercept `paste` in `QuickAdd` (all three layouts) only when the field is empty or fully selected and the cleaned text has ≥ 2 lines; open the offer popover anchored to the field with the count, five previews, "and N more", Add N tasks (Enter), Paste as one line, Escape; the over-100 message with Import; verify with a happy-dom test in `web/src/app/quickAdd.test.tsx` for each branch, including that a paste into a non-empty field is untouched
- [x] 3.2 Parse each line with the field's parse options (dismissed chips not carried; empty parsed title keeps the cleaned text) and hand the inputs to a new optional `onAddMany`; verify with a test that "Call Anna tomorrow 10am" and "Send invoice #Work p1" become the expected inputs
- [x] 3.3 Implement `onAddMany` in `TaskListView` (view defaults per line, the `o` anchor places the block in order, the Inbox "Added to …" note once with a count), `SectionQuickAdd`, the command bar, `QuickAddSheet`, `ShareCapture` and `AddOnDayDialog`; verify with tests in Today (due today per line) and in a section (section kept), then `npm test` and `npm run build` in `web/`
- [x] 3.4 Add a story for the offer in `web/src/app/quickAdd.stories.tsx`; verify `make ui-check` and `make ui-lint`

## 4. Subtasks

- [x] 4.1 Same interception in `AddSubtask` (`web/src/app/task-detail/Subtasks.tsx`) with "Add N subtasks", no parsing, `createTasks` with `parent_id` and the parent's project, focus kept; verify in `web/src/app/task-detail/subtasks.test.tsx` (order, progress count, no due date, offline batch)

## 5. Strings and docs

- [x] 5.1 Extract the new strings (`node scripts/i18n/extract.mjs --write`) and translate them in `web/src/locales/{de,fr,it,es,pt}.json`; verify `make i18n-check`
- [x] 5.2 Document pasting a list in `docs/quick-add.md` and `docs/notes-and-subtasks.md` (markers removed, per-line parsing, 100-line limit, Undo); verify `make docs-check`
- [x] 5.3 Add a CHANGELOG entry under Unreleased when the change is archived; verify `make check` passes
