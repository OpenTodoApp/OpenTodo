# Undo moving an Inbox task to another workspace

## Why

#1748 (justinsteven) asks for moving a task to be a step of the undo history. Moving a task to a project already is, and so is the task panel's move to another workspace's Inbox (`moveUndoable` with a workspace), but two other ways of moving an Inbox task to another workspace wrote straight through `updateTask`: the command palette's "Move “…” to workspace …" and the "Move to …" action of the toast after quick add. Ctrl/Cmd+Z did nothing after either.

## What Changes

- Both go through `moveWithUndo` with the target workspace, as the panel does: one step in the undo history named with the existing words "Moved to {workspace}", and the Undo toast.
- A task already in that workspace records nothing, as before.

## Out of scope

- Moving a project to another workspace (it has its own action).

No new field, no new string, no op-log or API change, no new environment variable.
