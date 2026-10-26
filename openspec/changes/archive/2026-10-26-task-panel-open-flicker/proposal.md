# Proposal

## Why

Issue [#442](https://github.com/OpenTodoApp/OpenTodo/issues/442) (v0.14.0, Chrome) reports that the task side panel still flickers in one case. The earlier fix for #383 did not cover it. The steps:

1. Open a project.
2. Open another project. The panel stays open and reads "No task selected".
3. Select a task. The panel flickers.

The #383 fix (`web/src/app/PanelHost.tsx:47-53`) holds the task the panel already shows while the next one is read from the database. In step 3, though, the panel shows the empty pane, so there is nothing to hold. Two things then happen in a row:

- **The slot empties while the task loads.** Docking the task replaces the empty occupant, but `useTask` returns `undefined` until its live query answers, which takes one or more frames. Meanwhile `PanelHost` returns `null` (`PanelHost.tsx:62`): the "No task selected" pane disappears, the list beside it widens to the full width, and then narrows again when the task arrives.
- **The panel replays its slide-in.** `enteredFor` treats "no task before" as "opened from closed" (`PanelHost.tsx:39-45`), so the arriving task gets `panel-enter` (`task-detail/TaskDetail.tsx:66`). It fades in from opacity 0 and slides 1.5 rem, even though the panel was already open on screen.

Going to another list always empties the panel by spec (`web-app` "Task details in a side panel"), so this happens on every first selection after changing lists. It isn't specific to projects.

## What Changes

- **The slot never empties when a task replaces the empty pane.** While the chosen task is still being read, the slot keeps showing what it showed: the empty pane, at the same width.
- **No slide-in from the empty pane.** Showing a task in an open panel that read "No task selected" doesn't replay the slide-in. The panel still slides in when it opens from closed, as "Overlay motion" says.
- **A regression test for the exact path of #442**: the empty pane after changing lists, then a selected task. It checks that the slot never leaves the page and that the task has no entrance animation.

No data, op, API or environment-variable change. Not **BREAKING**.

**Out of scope**: the Inbox's own split pane (`inbox-triage`), the expanded task page, and the panel's appearance. The motion when the panel opens from closed is unchanged.

ROADMAP.md: no numbered row. This is a bug fix to the shipped side panel (`task-side-panel`, archived 2026-10-25).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: a new requirement, "The panel slot stays in place while it fills". Choosing a task while the open panel shows the empty pane keeps the slot on screen at its width until the task shows, and doesn't replay the slide-in. It's added rather than merged into "Task details in a side panel" or "Overlay motion", whose texts are already long.

## Impact

- **Code**:
  - `web/src/app/PanelHost.tsx`: what the slot renders while a newly docked task is still undefined, and when `enteredFor` is set.
  - `web/src/app/task-detail/TaskDetail.tsx`: no change expected; `entering` already drives `panel-enter`.
- **Tests**: `web/src/app/sidePanel.test.tsx` (the #442 path) and `web/src/app/panelMotion.test.tsx` (no slide-in from the empty pane; a slide-in from closed still happens).
- **Dependencies**: none.
- **Issue**: Fixes #442.
