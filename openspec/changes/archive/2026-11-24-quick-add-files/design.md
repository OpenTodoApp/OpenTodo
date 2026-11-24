# Design

## Context

Attachments are synced entities written with `mutate()`; their bytes wait in `attachmentBlobs` until the uploader sends them after a sync round (`web/src/lib/attachments.ts`, attachments D3, D7). `planFiles` checks the limits and plans the rows, `commitFiles` stores the bytes first and then writes the rows with other changes in one batch; the capture screen already creates a task and its files this way. Quick add (`QuickAdd.tsx`) hands each screen a `QuickAddInput`, and every screen ends in `createTask`, `addTaskUndoable` or `addTasksUndoable`.

## Decisions

**D1. Files ride on the new task's input.** `NewTaskInput` and `QuickAddInput` get `files?: File[]`, as they have `links`. The three creators plan the task as before and, when an input has files, write through `withFiles`: `planFiles` for each input with files, then `commitFiles` with the creator's own writer (`mutateMany`, or `applyBatch` for the undoable ones). One batch holds the task, its companions and its attachment rows, so one Undo removes them all and the task never syncs without them. `createTask` loads `attachments.ts` only when there are files (that module imports `ops.ts`), as `ops.ts` already does for the series planners. Screens need no change: their defaults spread the input, `files` included.

**D2. The paste is read in the field.** `filesFrom` (the task panel's reader, which names a pasted screenshot) takes the clipboard's files. With none, the paste goes on as before: the paste-to-tasks offer, link tokens, plain text. With files, the paste is held (nothing goes into the title, as in the comment composer) and `checkFiles` runs the checks of `planFiles` (signed in, attachments on, per-file size, quota against what already waits on the device), with the same messages. A refused paste lists nothing and shows the message under the field (`role="alert"`); an accepted one adds the files to the pending list. `planFiles` checks again when saving, so a limit learnt meanwhile still applies; a refusal then puts the line and the files back with the message. A demo instance refuses with the capture screen's message. No type is refused or added: the server's rules (any type stored, a fixed list served inline, everything else downloaded) are unchanged, and the list shows only the name, as text.

**D3. The pending list.** Under the field, in every layout, `PendingFiles`: one chip per file with the paperclip, the name and a remove button named "Remove {name}", in a list named "Files to attach". It is the comment composer's list, moved into a shared component. A visually hidden status line says "{name} will be attached" for the last file added. Removing a file returns focus to the field. Adding the task, or a pasted list's Add, clears the list. The capture screen, which lists shared files itself, turns the paste off (`pasteFiles={false}`).

**D4. A pasted list** confirmed while files are pending gives them to its first task, as the capture screen does.

**D5. Reusable lists.** A line with files never reuses an item, as a line with a link does: the files would be lost.

## Data model

None: attachment rows are the existing entity and fields. No op schema change.

## Offline and convergence

Offline, the task and its attachment rows are written locally at once and the bytes wait on the device, uploaded in order after the next sync, exactly as files added in the task panel; they converge like any attachment. A browser that cannot keep files (private browsing) refuses with the existing message and nothing is written.

## Interface budget

No chrome above a list's first item: the pending list appears only under a quick add that holds files and goes when the task is added. No new task property, sidebar destination, scroll region or shortcut.

## Size

No dependency; no change to the container image or memory. The first load grows by about 1.5 KB gzip (704.9 to 706.3 KB of the 712 KB budget): the paste handling, the pending list and the shared limit checks are in quick add, which every list draws on its first paint, so loading the list lazily would save little and delay the first chip.
