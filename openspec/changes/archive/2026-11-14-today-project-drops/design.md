# Design

## Context

The “Drops across project groups in a view” requirement (`view-project-drops`) places a transferred top-level task before or after the indicated destination row and stores its placement in the view's own order. Today's project groups already exist. Today has a personal sort setting, but no stored manual sequence.

## Goals / Non-Goals

**Goals:** Today supports project-group drops when grouped by Project, with a predictable position in the destination and a personal order.

**Non-Goals:** Date membership, Today limit allocation and new empty group targets.

## Decisions

### D0. Follow the project tree's drop depth

Between rows with Nest subtasks on, map horizontal movement to depth using the project list's gap rules. Show the line at the resolved depth and use that same placement in the writer. Nested placement uses the parent's task order, including when moving between project groups. A direct drop onto a row appends to its subtasks. Keep sharing checks and cycle checks in the move planner.

### D1. An explicit placement is relative to the destination

A drop line is the placement contract. With Home `A, B, C` and Work `X, Y, Z`, dropping `B` between `X` and `Y` results in Home `A, C` and Work `X, B, Y, Z`. This preserves all unaffected tasks' relative order. Copying an ordinal such as “second in Home” can disagree with the line the user chose. A project-only move on a group header or its empty space supplies no row anchor. Keep the selected sort and the task's saved Today rank if it has one; otherwise let the destination's sort or fallback place it. This is the case where “keep its place” has a useful meaning.

### D2. Today owns its manual order

The first positional drop or keyboard reorder seeds the personal sequence from the currently shown top-level order in the active project groups, then applies the position. This avoids a jump to project-position order when switching from Due date or Title, including a reversed sort. Reuse the bounded view-order representation and placement logic with Today as a new order host. Reuse Today sort fields and add a personal order-list field. Existing placements for temporarily hidden open tasks are retained subject to the shared 500-ID limit. Unplaced rows fall back to Today's default sort. A project transfer across sharing scopes that creates a new task ID carries the Today rank to that ID. Reset clears the saved list. Special groups and the Today portion of Upcoming use the ordinary Today sort while Manual is active.

### D3. One undoable move

Reuse the project-group move planner and its permission, cycle and sharing-scope rules. With Nest subtasks enabled, all eligible visible rows are drop targets, including existing subtasks. Share the project list's gap, sideways depth and sibling placement rules with saved views grouped by Project. The line shows the exact depth and position. Dropping onto the middle of a row appends to its subtasks. Reordering top-level rows only updates personal preferences. An actual move updates the task structure and any personal placement together through the op log, with one Undo. Dates stay as stored. Changes apply immediately offline and converge per field by last writer wins.

### D4. Interface and size

Reuse the existing Display options, drop line and row feedback. Keep the same header, row properties, sidebar slots and scroll regions. Existing Reorder/Move actions and the parent picker provide pointer alternatives. Load the Today drop resolver when Today is grouped by Project and keep the project-group writer lazy. No new dependency, API or configuration.

Load the saved view screen only when opened. Against `c2b3440fa`, the entry falls from 150,313 to 142,955 bytes gzip and the static first load from 724,606 to 719,818 bytes gzip. Both stay within the existing limits. The stripped Linux server with embedded assets grows from 44,101,792 to 44,118,176 bytes.

## Risks / Trade-offs

Manual order stores up to 500 IDs, as in saved views. When the list reaches that limit, existing bounded-order fallback rules apply. Keep any normalization local to Today so saved views and labels preserve their current behavior.
