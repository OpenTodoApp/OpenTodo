# Proposal: assistant-project-blocks

## Why

Questions about projects and progress ("what's in progress on the website?", "is the renovation on track?", "what did the team do yesterday?", "how am I doing with running?") deserve the app's own project views, not prose. The views exist: the board, the timeline, the activity feed, statistics, habits and the task panel.

## What Changes

**Six display tools** for the in-app assistant, on the server and on the device:
- **`show_board`:** a project's board, or one column of it, read-only.
- **`show_timeline`:** a project's tasks as bars from start to deadline.
- **`show_activity`:** recent changes and comments of a project or task.
- **`show_stats`:** small number cards: completed in a range, overdue, the Inbox count, the Today limit.
- **`show_task`:** one task in full, read-only: notes, subtasks, comments.
- **`show_habit`:** a habit's grid and current streak.

**To keep the toolset lean,** display tools beyond the first six are offered only when a turn's context or skill suggests them. A turn without a skill offers all of them only while the provider's strict-tool limit allows (D2).

## Capabilities

### New Capabilities

### Modified Capabilities

- `assistant-blocks`: new requirements for the six blocks, and for how they are offered.

## Out of scope

- Editing from these blocks, except ticking tasks, which already works in task rows. Changes stay proposals.

## Roadmap

A follow-up to `assistant-generative-ui`.

## Impact

- `internal/assistant/blocks.go`: six tools and their checks; the manifest and vectors.
- `web/src/app/assistant/blocks`: six lazy renderers reusing `BoardView` columns, the project timeline, the activity list, the statistics cards, the habit grid and `TaskDetail` read-only.
