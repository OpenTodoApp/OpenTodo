# Proposal

## Why

Projects are currently a flat list. People who organise work by area ("Home → Garden → Spring planting", "Work → Client A → Q4 launch") have no way to express that structure, so the sidebar grows into a long undifferentiated list and related projects drift apart. The project entity already carries a reserved `parent_id` field that every client and the server validate and sync, so the data layer is ready; what is missing is behavior: a tree in the sidebar, moving projects, rolled-up counts, and rules that keep the tree well-formed when two devices edit it concurrently.

## What Changes

- Projects can be nested under another project to any depth by setting the existing `parent_id` field.
- The sidebar renders projects as a collapsible tree. Collapse state is a per-device preference and is not synced.
- A project can be moved under another project, to the top level, and re-ordered among its siblings, from the project header and from the keyboard.
- A project's view lists its own tasks and, below them, its direct sub-projects with their counts.
- Cycle prevention: a client never offers a project's own descendants as a new parent, the REST API rejects such a patch, and when concurrent moves on two devices still produce a cycle after sync, every device breaks it the same deterministic way without manual intervention.
- Counts roll up: a collapsed parent shows the open-task total of its whole subtree; an expanded parent shows only its own.
- Archive cascades to descendants; delete promotes sub-projects to the deleted project's parent and keeps moving open tasks to the Inbox.
- The JSON export is unchanged (it already contains `parent_id`).

Out of scope: sections inside a project (`board-view`), nested subtasks (`subtask-trees`), drag-and-drop in the sidebar (`manual-ordering` owns drag interaction; this change provides keyboard and menu moves and uses the existing `position` field), restoring deleted sub-projects (`trash-and-history`), sharing a subtree (`project-sharing`).

This change advances ROADMAP.md section 3, "Nested projects (`parent_id` already reserved)".

No new environment variables. No breaking change to the op log: `parent_id` already exists in the project schema; no field is renamed or removed.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `project-organization`: project fields gain hierarchy semantics; archive, delete and counts change to account for sub-projects; new requirements for the sidebar tree, collapse/expand, moving projects, cycle prevention and the sub-project list inside a project view.

## Impact

- Client: sidebar tree rendering, project header "Move to" picker, project view sub-project list, cycle check and deterministic cycle breaking in the data layer, per-device collapse state in the local `meta` table.
- Server: cycle check on `PATCH /api/v1/projects/{id}` when `parent_id` is set; no schema or migration change.
- Docs: `docs/api.md` (patch validation), `docs/sync.md` (cycle-breaking rule), README feature list.
- No new dependencies; bundle growth expected under 4 KB gzipped.
