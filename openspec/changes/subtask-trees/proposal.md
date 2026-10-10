# Proposal

## Why

Many tasks are really small projects: "Plan trip" is "book flights", "book hotel", "renew passport". Today each piece must be a separate flat task or live in the description where it cannot be completed, scheduled or counted. The task entity already carries a reserved, synced `parent_id` field; this change gives it behavior: subtasks nested to any depth, a parent that shows its progress, indentation in lists, moves between parents from the keyboard, and convergence rules for the tree so that concurrent re-parenting on two devices never leaves a task unreachable or nested inside itself.

## What Changes

- A task may have a parent task (`parent_id`), to any depth. A subtask belongs to the same project as its parent; moving a parent to another project moves its whole subtree.
- Subtasks are created from the detail panel and from the keyboard on a selected task, inheriting the parent's project.
- Project and Inbox lists render subtasks indented beneath their parent, collapsible per device. Date-based and other cross-project views show matching subtasks flat with a parent breadcrumb.
- A parent shows its progress as "completed/total" over its direct subtasks in rows and in the detail panel.
- Completing a parent completes all its open descendants; reopening a parent reopens only the parent; completing the last subtask does not complete the parent automatically but offers to.
- Tab indents a selected task under its previous sibling, Shift+Tab outdents it; the detail panel offers a "Parent task" picker that excludes the task's own descendants.
- Deleting a parent soft-deletes its descendants. Open subtasks whose parent is completed or deleted are displayed at the top level of their project without any data being written.
- Cycle prevention: client refusal, REST rejection, and a deterministic write-free cycle-breaking rule shared by every device.

Out of scope: progress rolled up over all descendants (shown over direct children only), subtasks that live in a different project than their parent, drag-and-drop re-parenting (`manual-ordering` covers drag; this change provides keyboard and picker), restore of deleted subtrees (`trash-and-history`), subtask templates, recurring subtasks (`recurring-tasks`).

This change advances ROADMAP.md section 3, "Subtask trees with parent progress (`parent_id` already reserved)".

No new environment variables. No breaking change to the op log: `task.parent_id` already exists; no field is renamed or removed.

## Capabilities

### New Capabilities
- `subtasks`: the parent reference, creating subtasks, nested display, progress, completion rules, moving between parents, cycle prevention under concurrent edits, and deletion of a subtree.

### Modified Capabilities
- none. The `task-management` requirements for complete, reopen and soft delete stay as written; this capability adds the cascade rules for parents on top of them.

## Impact

- Client: tree building and cycle breaking shared with `project-hierarchy` (same algorithm over a different entity), nested rendering in `TaskListView`, breadcrumb in flat views, detail panel subtask list and parent picker, Tab/Shift+Tab handling, cascade helpers in the data layer.
- Server: `PATCH /api/v1/tasks/{id}` validates `parent_id` (exists, same project, no cycle); no schema or migration change.
- Docs: `docs/api.md`, `docs/sync.md` (cycle-breaking rule, cascade semantics), README feature list.
- No new dependencies; bundle growth expected around 5 KB gzipped.
