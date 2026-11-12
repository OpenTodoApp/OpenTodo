# Proposal

## Why

A meeting note, a packing list or a project brief often holds the next actions as check-list lines. Today only a single line of a task's note can become a subtask (Make subtask); a standalone note or a project note can only become one task as a whole (Turn into task). People copy lines into the quick add by hand and lose the connection to where the action came from.

## What Changes

- **Make tasks from a note.** In a project note or a standalone note, choose Make tasks on a check-list line or a selection (slash menu, context menu, or the existing Make subtask key, Ctrl+Shift+Enter / ⌘+Shift+Enter): one task per check-list line, read with quick-add syntax, in the note's project (Inbox for a standalone note without one).
- **Make subtask on a selection.** In a task's note, the same command now takes a selection of lines too.
- Each line becomes a link to its task, so Linked references connect note and task both ways; one Undo takes back the tasks and the lines; offline included; at most 50 lines at once.
- **Routines.** Create tasks gains "Link back to the note", so a routine that turns a note's lines into tasks leaves a link to the note in each task.

No new op field, entity, route, dependency, shortcut or mandatory environment variable. Not **BREAKING**.

Out of scope: rewriting the source note from a routine (the server never edits lines of a document); keeping a line's checkbox and a task's completion in sync both ways (the link shows the task's state); making tasks from comments; making tasks from bullet lines without a checkbox.

Builds on `notes-in-routines` (the Note type and the "Checkboxes to tasks" use case).

Roadmap: the "Notes area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rich-text-editing`: Make subtask takes a selection; Make tasks in project and standalone notes.
- `routines`: Create tasks can link each task back to its note.

## Impact

- Web: the editor's Make subtask command (`web/src/app/NotesEditor.tsx`, `web/src/app/notes/NoteEditor.tsx`, the editor extension that turns a line into a link), a batch through `mutateMany` with the quick-add parser (`web/src/lib/nlp`), the slash and context menus, the shortcut's description in the registry; `web/src/lib/rules/steps.ts` and the device planner for the routine input.
- Server: `internal/ruleval/steps.go`, `internal/rules/routine_steps.go` (the link line in each new task's note through the agent tools' planning).
- Docs: `docs/notes-and-subtasks.md`, `docs/notes-to-tasks.md`, `docs/routines.md`, `docs/keyboard.md` (generated).
- Size: under 1 KB in the lazy editor chunk; the quick-add parser is already in it.
