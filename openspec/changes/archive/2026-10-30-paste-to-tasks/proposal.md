# Proposal

## Why

People keep lists outside the app: a shopping list in a chat, the action items of a meeting, a checklist in a note. Things 3 turns a multi-line paste into one task per line, and the research names it as a small, much-loved capture shortcut (research §1 Things, roadmap phase P1.5; gap analysis "Multi-line clipboard paste → separate subtasks/tasks": Missing). In OpenTodo today the quick add and the Add subtask field are single-line inputs, so the browser flattens a pasted list into one long title that the user then has to split by hand.

## What Changes

- **Paste a list into quick add.** When text with two or more non-empty lines is pasted into an empty quick add (the list's, a section's, the command bar's, the phone sheet, the share capture screen and the Add-on-day dialog), the field offers "Add 7 tasks, one per line?" with a short preview, instead of pasting one long line. Confirming creates one task per line; "Paste as one line" keeps today's behaviour.
- **Each line is a quick-add line.** With natural-language parsing on (the device setting), each line is parsed on its own (dates, `#project`, `@labels`, `p1`, recurrence, reminder phrases), and the view's defaults fill the rest, exactly as if each line had been typed and added. Common list markers (`-`, `*`, `+`, `•`, `1.`, `1)`, `[ ]`, `- [ ]`, `- [x]`) are removed from the front of each line; blank lines are skipped.
- **Paste several subtasks.** The same offer in a task's Add subtask field creates one subtask per line under that task (no parsing, as for a typed subtask).
- **One batch, one Undo.** All tasks of a paste are written in one operation batch, in the pasted order, and one Undo removes them all.
- **A limit.** A paste of more than 100 lines is not split; the offer says so and points to Import.

Out of scope: indentation turning lines into subtasks of the line above, keeping a Markdown checkbox's checked state, splitting a paste into the task's notes, a paste into the title editor of an existing task, and a multi-line `ot add` in the CLI. The REST API, the MCP `create_tasks` tool and the in-app assistant already take several tasks at once and are unchanged.

Advances ROADMAP-1.0 milestone 0.17 "Calm constraints", item `paste-to-tasks`; ROADMAP.md capture items.

Relates to #540

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `natural-language-capture`: a new requirement "Pasting several lines into quick add" (the offer, line cleanup, per-line parsing, the limit, one batch).
- `subtasks`: a new requirement "Paste several subtasks".

## Impact

- **Data model, sync, op schema:** none. Each line is an ordinary task create; the batch is one `mutateMany` call, applied locally first and uploaded together, so it works offline and converges like tasks created one by one.
- **E2EE:** titles are content fields already and are encrypted by the normal write path; the existing encrypted-size check refuses the whole batch before any op exists if one line is too long.
- **API, CLI, MCP, CalDAV, vault:** unchanged.
- **Web:** `web/src/app/QuickAdd.tsx` and its layouts, `web/src/app/task-detail/Subtasks.tsx`, a small pure helper in `web/src/lib` (split and clean lines), `createTasks` in `web/src/lib/ops.ts` (several `planTask` changes in one batch), the shared Undo toast. Strings in six languages.
- **Size:** no dependency; a few hundred bytes of client code. No server or binary change.
