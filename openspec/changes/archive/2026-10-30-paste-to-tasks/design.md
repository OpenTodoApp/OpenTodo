# Design

## Context

Quick add (`web/src/app/QuickAdd.tsx`) is an `<input>` in three presentations (`line`, `palette`, `sheet`); a browser drops or flattens newlines when text is pasted into an input. Its `onAdd` receives one parsed `QuickAddInput`, and each screen (`TaskListView`, `SectionQuickAdd`, the command bar, `QuickAddSheet`, `ShareCapture`, `AddOnDayDialog`) merges it with its own defaults before calling `createTask`. `AddSubtask` (`web/src/app/task-detail/Subtasks.tsx`) is a plain input calling `createSubtask(parentId, title)`. `nextTaskPosition` in `web/src/lib/ops.ts` already hands out distinct increasing positions to tasks created in the same tick ("a paste of several lines").

## Goals / Non-Goals

**Goals:** a pasted list becomes tasks in one confirmed step, offline, with one Undo, wherever a task is typed.

**Non-Goals:** a general text importer (Import exists for files), outline parsing, any server change.

## Decisions

### D1: Intercept the paste, then ask

`onPaste` reads `text/plain`. If the field is empty (or its whole value is selected) and the text holds at least two non-empty lines after cleanup, the default paste is prevented and an offer opens in a popover anchored to the field (not a row in the list: the interface budget's "Nothing between the header and the list" stays intact). The offer shows the count, the first five cleaned lines and "and N more", and two actions: **Add N tasks** (default, Enter) and **Paste as one line** (inserts the lines joined by spaces, as the browser would). Escape closes the offer and pastes nothing. A paste into a field that already has text is never intercepted: the user is mid-sentence.

*Alternatives:* split silently (Things does): surprising when someone pastes an address or a multi-line URL title; a modal dialog: heavier than needed, and it breaks the phone sheet's keyboard.

### D2: Line cleanup is a pure, tested helper

`splitPastedLines(text)` in `web/src/lib/pasteLines.ts`: split on `\r\n`, `\n` or `\r`; trim; drop empty lines; remove one leading list marker (`-`, `*`, `+`, `•`, `‣`, `◦`, `1.`, `1)`, `a)`, `[ ]`, `[x]`, `- [ ]`, `- [x]`, `☐`, `☑`) and the spaces after it; collapse runs of whitespace. A line that is only a marker is dropped. The checked state of `[x]` is ignored (out of scope); the line becomes an open task. No Go twin: the server never splits pastes.

### D3: Each line goes through the screen's own `onAdd`

The offer calls the same `parse` with the same options for each line (dismissed chips do not carry over; a line whose parse leaves an empty title, such as "tomorrow", keeps its raw text as the title, like the parse's own escape). The screen's `onAdd` then builds each task with its view defaults. To keep one batch, `QuickAdd` gains an optional `onAddMany(inputs)`; screens implement it by planning every task with `planTask` and writing them through one `createTasks(inputs)` in `ops.ts` (task changes plus their quick-add reminders, time entries and, once `default-reminders` lands, default reminders) in one `mutateMany`. A screen without `onAddMany` (none planned) would fall back to calling `onAdd` per line. The `o` "insert after" anchor of `TaskListView` places the block after the anchor in order.

### D4: Order and position

Tasks keep the pasted order. `planTask` positions are increasing within the batch, so in a manual list the block appears in reading order at the end; when the `add-position` preference is "top", the block is placed above the first task, still in reading order (that change computes the positions for the whole block at once).

### D5: One Undo

After the write, the shared bulk toast says "7 tasks added" with Undo, which tombstones the created tasks (and their reminders) in one batch, as other bulk creations do (`showBulkToast`). Inbox's "Added to …" note (inbox-means-unplaced) is shown once with the count of tasks that went elsewhere, never once per line.

### D6: Limit of 100 lines

Above 100 lines the offer shows "That is more than 100 lines. Use Import for long lists." with Import and Paste as one line. 100 keeps one batch well under the sync upload and server limits and inside the bulk-action scale the app already supports.

### D7: Subtasks

`AddSubtask` gets the same interception and offer with "Add N subtasks"; lines are not parsed (the field does not parse today) and become subtasks of the parent, in order, in one batch via `createTasks` with `parent_id` and the parent's project.

## Data model, size and budget

No op field, no migration, no dependency; no change to image size or memory. Interface budget: the offer is an overlay anchored to the field; no row above the list, no new task property, sidebar destination, scroll region or shortcut. Progressive disclosure: nothing changes for anyone who never pastes several lines; Simple-list users see the offer only when they do.

## Risks / Trade-offs

- [A pasted paragraph with hard line breaks is offered as several tasks] → the offer always asks first, and "Paste as one line" is one click.
- [Platform paste on phones may deliver `text/plain` without newlines (some keyboards flatten)] → then the paste is a single line and behaves as today; nothing breaks.
- [A line too long for an encrypted account] → the whole batch is refused before any op is written and the field shows the existing "too long to encrypt" message; nothing half-created.
