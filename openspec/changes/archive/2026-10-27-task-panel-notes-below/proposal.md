# Proposal

## Why

Issue [#444](https://github.com/OpenTodoApp/OpenTodo/issues/444), from osenchenko on v0.14.0. In the docked task panel the notes come straight under the title, clamped to about eight lines with a fade and a **Show all** line. The task's properties come after them: the facet lines with project, schedule, priority and labels, then the custom fields, the subtasks and the attachments.

This has two costs:
- **The properties move with the notes.** A short note puts them near the top; a long one pushes them down. The properties are the part people use on every task, yet they never sit in the same place.
- **Reading a long note takes an extra click every time.** The clamp resets whenever another task is opened, so it is **Show all** again for each task.

The reporter asks to put the notes below the properties, subtasks and attachments, and to drop **Show all** so the whole note shows.

The task page has the same problem below 1024 px, where the facts card sits under the notes. From 1024 px the page already keeps the facts in a sticky column beside the notes.

## What Changes

- **New order in the docked panel**, top to bottom:
  1. the header,
  2. the relations line,
  3. the facet lines with Add,
  4. the project's custom fields,
  5. the subtasks,
  6. the attachments,
  7. **the notes**,
  8. the Comments / Activity / History / Time tabs.

  The properties therefore keep the same place on every task, whatever the length of its notes.
- **No clamp and no Show all in the panel.** The whole note shows at rest, as on the task page. The note grows inside the panel's one scrolling body; it never becomes a second scroller inside the panel (see design D2 for the scroll-region budget).
- **Task page below 1024 px**: the facts card moves above the notes, so tablets and phones get the same "properties first" order. From 1024 px nothing changes: the facts column already sits beside the notes and stays in view.
- An empty note keeps its quiet "Add notes…" line, now in its new place.

No data model, op, API or environment-variable change. Not **BREAKING**.

**Out of scope**:
- Collapsing or folding the properties.
- A size limit or inner scroller for notes. This is a deliberate choice against part of the request; see design D2 and the open question there.
- The notes editor itself.
- The conversation tabs' sticky behaviour, which is unchanged.

ROADMAP.md: no numbered row. This refines the shipped task panel (row 9, Precision; continues `task-panel-facets` and `task-panel-polish`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`:
  - **"Task panel layout" (modified):** the docked panel lists the notes after the attachments, unclamped; on the task page below 1024 px the facts sit above the notes.
  - **"Task panel notes clamp" (removed):** replaced by the new requirement "Task panel notes in full", which states that the notes are never clamped, have no Show all, and grow inside the panel's single scroller.

## Impact

- **Code**:
  - `web/src/app/task-detail/TaskDetail.tsx`: the panel's body order.
  - `web/src/app/task-detail/TaskNotes.tsx`: `NotesClamp`, `NOTES_CLAMP_LINES` and the `clamp` prop removed.
  - `web/src/app/task-detail/TaskPageView.tsx`: the facts above the notes below 1024 px.
  - `web/src/index.css`: the `.notes-clamp` rule removed.
  - `web/src/locales/*`: the "Show all" string stays, because Activity settings use it.
- **Tests**:
  - A new panel order test in `web/src/app/task-detail/`.
  - The page order test.
  - The layout check, which keeps the project screen with the panel at 3 vertical scroll regions.
  - The Storybook baselines of `Task/Panel` and the task page stories.
- **Docs**: `docs/task-panel.md` and the in-app help generated from it.
- **Dependencies**: none.
- **Issue**: Closes #444.
