# Design

## Context

`rich-text-editing` "Checklist items become subtasks" turns one check-list line of a task's note into a subtask and the line into a link, with Ctrl+Shift+Enter, and is not offered in project notes. Standalone notes can turn into a task as a whole (`standalone-notes`). Links between notes and tasks are Markdown links read on the device (`note-links`), so a line turned into a link already shows up in Linked references.

## Goals / Non-Goals

Goals: from any note, turn the action lines into tasks in one step, keep the connection, keep it undoable and offline.

Non-goals: a two-way checkbox, task extraction by AI (the assistant and routines' Ask AI cover it), lines without a checkbox.

## Decisions

### D1. One command, two names

The command is the existing one: same key, same menus. In a task's note it is Make subtask (the lines belong under the task); in a project or standalone note it is Make tasks. Standalone notes still do not offer Make subtask (`standalone-notes` "Writing a standalone note"): Make tasks is a different command.

Alternatives considered:
- **A new key for Make tasks.** Rejected: two keys for the same gesture; the note decides which it is.
- **Subtasks of a new task named after the note.** Rejected: an extra task nobody asked for.

### D2. Quick-add syntax for tasks, verbatim for subtasks

Lines in a meeting note often carry "friday" or "p1"; Make tasks reads them with the quick-add parser, as the routine's Create tasks does. Make subtask keeps the verbatim title it has today, so its behaviour does not change for existing users.

### D3. A selection is one batch

All tasks and the note change are one local batch through `mutateMany`, so Undo is one step and other devices receive all or nothing. A cap of 50 lines keeps the batch within the write limits of a normal batch.

### D4. Routine link back

Create tasks gains `link_back` (bool), valid only when the step's text or lines trace back to a Get note text step. The link line is written into the new task's note in the task's creation batch, by the same planning as `create_tasks` with a note. The source note is not rewritten: the server does not edit lines of a mergeable document.

### Data model

None: tasks and note edits as today; `steps` gains an input value, a whole value as before.

### Interface budget

No new row, destination, scroll region or shortcut: the existing key and menu entries change their label by note kind.

### Size

Under 1 KB in the lazy editor chunk; no dependency.

## Risks / Trade-offs

- A line like "call mum 3pm" gets a time from quick-add; the task shows it at once and Undo restores the line.
