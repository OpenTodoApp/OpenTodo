# Proposal

## Why

The “Drops across project groups in a view” requirement (`view-project-drops`) covers project-group moves and nesting in saved views and label pages. Today already groups tasks by project and can support the same task management without opening each project. This follows up on the `view-project-drops` roadmap item and #1211.

## What Changes

- Reuse the project list's sideways drop depth in saved views grouped by Project, so the line shows the actual sibling placement.
- Extend these project-group gestures to Today under **Group by → Project**. A drop line positions a task within the destination group. A group-level drop transfers it at the top level. An onto drop uses the existing nesting and sharing rules.
- Store manual order as a personal Today preference. Preserve the relative order of all other tasks, including when the first positional drop switches from a sorted view to manual.
- Existing Inbox groups accept project moves with dates intact. Earlier, Blocked, Waiting for a slot and Done today retain their existing behavior.

### Out of scope

Label pages, saved views in other layouts or groupings, other built-in views, changes to date membership, and empty groups that are not displayed.

## Capabilities

### Modified Capabilities

- `builtin-view-options`: personal manual order for Today's project groups and its reset behavior.
- `manual-ordering`: drop depth in saved views and project-group drag, placement, nesting and Undo on Today.

## Impact

Reuse the existing project move and permission checks. Add personal Today order state through the op log. No API routes, dependencies, or mandatory configuration. Measure the first-load bundle.