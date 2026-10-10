# Proposal

## Why

A project today is one flat list. Work with stages ("Backlog → Doing → Done"), phases ("Research, Build, Launch") or themes needs a second level of structure inside a project and a way to see it side by side. Sections give that structure; a board view renders the same sections as columns that tasks move between. Both must work offline and converge across devices like everything else, which rules out any server-side notion of "board state": a board is just a different rendering of sections and tasks.

## What Changes

- A new `section` entity: a named, ordered container inside one project, soft-deletable, synced through the operation log like projects and tasks.
- An additive task field `section_id` (nullable id) referencing a section of the task's project. Tasks without a section remain valid and are shown first in the list view and in a leading "No section" column on the board.
- The project list view shows section headings with their tasks beneath, each heading with its own quick-add input and a per-section count.
- A board view for any project: one column per section plus "No section", columns ordered by section position, tasks ordered by position within a column. List/board mode is remembered per project per device.
- Moving tasks between sections by drag and drop, by keyboard (Shift+Left/Right moves the selected task to the adjacent column; a section picker lives in the detail panel) and through the API.
- Section lifecycle: create, rename, reorder, delete (tasks fall back to "No section"); moving a task to another project clears its section.
- REST: `/api/v1/sections` collection with the same write-through semantics as projects and tasks; the export gains a `sections` array.

Out of scope: per-column work-in-progress limits, swimlanes, board views across several projects or for saved filters (`custom-views`), custom column colours, drag-and-drop ordering rules beyond what moving between columns requires (`manual-ordering` defines fractional positions and same-list reordering; this change only sets `section_id` and appends the task at the end of the target column), section templates, Today/Upcoming as boards.

This change advances ROADMAP.md section 3, "Sections and Kanban board view".

No new environment variables. No breaking change to the op log: a new entity and a new nullable task field are additive; nothing is renamed or removed. The export format keeps version 1 and gains an additional top-level key.

## Capabilities

### New Capabilities
- `sections-and-boards`: the section entity, the task-to-section reference, section headings in the list view, the board view, moving tasks between sections, section lifecycle, the sections API and export.

### Modified Capabilities
- none. Existing `task-management` requirements continue to hold; `section_id` is described in the new capability as an additive field.

## Impact

- Server: `section` entity and `task.section_id` in the op schema; `sections` collection handlers; export includes sections; no SQL migration (entities live in the generic `fields` table).
- Client: `sections` table in the local database, section defaults in the op layer, list grouping, board view, drag and drop (pointer events, no library), keyboard moves, detail panel picker.
- Docs: `docs/sync.md` schema table, `docs/api.md` sections endpoints, README feature list.
- No new dependencies; bundle growth expected around 8 KB gzipped for the board and drag handling.
