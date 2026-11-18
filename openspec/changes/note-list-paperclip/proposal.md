# Proposal

## Why

From the phone feedback collected in GitHub issue [#1477](https://github.com/OpenTodoApp/OpenTodo/issues/1477): the notes list does not say which notes hold files, so finding the note with the receipt or the plan means opening them one by one. Task rows already show a paperclip with the number of a task's files.

## What Changes

- **A row of the notes list shows a paperclip and the number of the note's files** after its title, as task rows do: a standalone note counts its own files, a task's note counts the task's files (its comments' files included, as on the task row). A project note has no files and shows none. The count is live, and removed files are not counted.
- The paperclip is named for assistive technology ("2 attachments"), with the number shown beside it.

Out of scope: a "notes with attachments" filter (the issue mentions it as optional), and files inside a note's text that are only linked.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notes-page`: a requirement for the paperclip on a row.

## Impact

- `web/src/lib/attachments.ts` (`noteAttachmentCounts`), `web/src/app/useCommentCounts.ts` (one shared live query, `useNoteAttachmentCount`), `web/src/app/notes/NoteRow.tsx`, `web/src/app/notes/noteRowAttachments.test.tsx`, `docs/notes.md`.
- No new string (the task row's plural is reused), op, route, setting or dependency. One live query over the attachments table for the whole list, like the task rows'.
