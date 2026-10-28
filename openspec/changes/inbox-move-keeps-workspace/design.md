## Context

The partition (OpenSpec `workspaces`, D2) places a task with a known project in its project's workspace and a task without one by its own `workspace_id`. Tasks created inside a project carry no `workspace_id`, so clearing `project_id` dropped them into the default workspace (#508).

## Decisions

- **Keep, don't pick.** The value written is the workspace the task is in before the move, computed with the existing partition (web `Partition.taskRow`, server `Partition.Task`), not the device's current workspace: a move to the Inbox never changes a task's workspace, whichever device or tool makes it. In the app both are the same, since only the current workspace's projects and Inbox are shown.
- **Only when it differs**, and as null for the default workspace, so a one-workspace account and the default workspace write no extra op (the op footprint of workspaces D5).
- **Same batch** as the move: the planners (`planProjectChange`, the agent's `move_tasks`) add the field, so the move and the workspace converge together and Undo takes both back. A move across sharing scopes copies the task: the copy gets the field the same way.

Data model impact: none; the additive `task.workspace_id` is written where it was missing. No dependency; no measurable bundle or binary change.

## Risks / Trade-offs

- [A device that has not received the project's workspace yet sees the default] → it writes null, matching what it shows; the person's other devices already agree with that view. Rare and self-consistent.
