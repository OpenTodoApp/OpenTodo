# Design

## Context

`inToday` and `tasksForView` determine membership, including due dates, deadlines and reached start dates in the person's logical day. `useListModel` computes the closed list before grouping. `todayGroups` and `dayRows` build each group's tree from its members. Upcoming's Start with Today calls the same grouping helper. After grouping, `TaskListView` uses the rows for navigation, bulk selection and the day's displayed totals.

## Goals / Non-Goals

**Goals**

- Show eligible direct children of a Today task inline with **Nest subtasks** on, using the existing tree and manual sibling order.
- Give each contextual row a muted title, its own date information and the usual individual actions. Keep scheduling, counts, slots and bulk actions on their existing inputs.
- In Group by Project, support a date-preserving drop onto another eligible parent and a separately labelled drop to promote the subtask for today.
- Keep the view derived from local data and responsive to completion, date edits, reparenting and sync.

**Non-Goals**

- Date inheritance, another setting or an alternate day membership rule.
- Contextual descendants of a parent that is itself contextual, or additional context under Earlier, Blocked, Waiting or Done today.
- Changes to Upcoming, saved views, calendar planning or drag-and-drop in other groupings.

## Decisions

### D1. Attach children after Today has chosen its members

Keep `inToday`, the Today task query, the existing group membership and the closed-list fill path intact. Build a parent-to-children index from the available local tasks once for the Today view when nesting is enabled. With it, supplement only the regular day groups' tree inputs. The parent must be a member of the group after visibility, filtering and slot checks. An eligible child is open, visible and outside `inToday`. It either has no scheduling dates or has only future scheduling dates. Explicitly parked Someday tasks keep their current placement. Use the same logical-day and zoned date helpers as Today. Honor existing archive, workspace and assignee visibility and the active duration filter.

Build the tree with `buildTaskTree` and flatten it after applying collapse state. This preserves manual sibling order, indentation and tree keyboard behavior. A regular Today row can itself be nested and still provide context for its own direct children. A contextual child is a leaf in this projection. When a child qualifies for Today on its own, the existing membership and grouping rules take over and the child appears once. A shared grouping helper receives context only from the actual Today route, so Upcoming's Start with Today can keep future tasks in their own days.

With the Today limit on, an admitted parent's subtree can still show supplementary rows. Filled and waiting sets come from regular Today membership. No supplemental rows appear under a parent waiting for a slot. This keeps the limit usable while the parent has a slot.

### D2. Use the same task row with an explicit presentation state

Carry a presentation flag on `ListRow`, through `nodeRow`, row reuse in `sameRow`, and the existing row renderer. Keep the complete control and focus indicator at their normal contrast and reuse the muted text token for the title. Reuse the row's date rendering so a future due, deadline or start stays readable in One line and Detailed, including narrow widths. The parent's group date cannot stand in for the child's date. Give assistive technology a short contextual description in addition to the normal tree level and task name. Opening, editing and completing a row use the existing handlers and permission checks.

### D3. Keep bulk and ranking inputs on the original rows

Keyboard focus and collapse operate on the visible tree. Group header counts, Today-specific totals, bulk selection and Today-specific ordering use regular rows. Gate both rendering and handler entry points for bulk selection so Select all, range selection and direct selection in bulk mode cannot tick a contextual row. Keep Today's bulk rescheduling and slot calculations on their existing inputs. A contextual child can still be rescheduled individually in its ordinary editor.

### D4. Use explicit destinations for contextual drags

With Group by Project and Nest subtasks on, allow a contextual row to start a drag. Dropping onto the middle of a regular Today task uses the existing nesting and move planner. It appends the dragged task under that parent in the same or another editable project of the same sharing scope, with the existing cycle and destination checks. It preserves the task's date fields and follows the existing subtree move rules. The moved row follows the destination parent's existing collapse state.

During a contextual drag, show a distinct **Make top-level for today** drop target in each eligible displayed project group. Use the existing top-level transfer rules to determine eligible destinations. The label announces the date change before release. Keep the ordinary group header's established meaning for regular drags. Contextual rows can be dragged onto eligible parent rows or onto the explicit scheduling target. Contextual rows stay outside row-gap placement, drop anchors and Today manual ranks.

Plan promotion through the existing project move and date planners. In the same undoable batch, clear the parent, apply any project move and set the promoted task's Do on date to the user's logical today at drop time. Keep the task's existing time and time zone where applicable. Deadline, start and descendant dates retain their values. Let the normal sort place the task and the normal slot logic admit it or put it in Waiting for a slot. Undo restores the original parent, placement, project and scheduling data. Both operations apply locally first, using the existing per-field sync and undo behavior.

Expose equivalent commands through the contextual task's Actions menu, using the same destination checks and actions. The parent picker follows the editable regular targets in Today. The promotion action offers the eligible project groups with the current group as the default. Reuse the existing keyboard navigation and picker controls.

### D5. Data and interface budget

The projection reads the local data already in the list model. It writes no operations, uses no new preference or schema field, and is derived again on sync. Individual task edits and the two explicit moves go through the existing op paths. No server files or dependencies change. The extra runtime state is a child index and derived rows only when the feature is active. The large-list tests guard row reuse.

Against upstream main at `cc5f27aa4` in the same Linux build environment, the gzip entry moved from 141.3 to 142.0 KB (148 KB budget) and its static closure from 700.0 to 700.7 KB (712 KB budget). The stripped server executable with embedded assets grew from 45,768,864 to 45,772,960 bytes.

Keep the existing two rows of list chrome, up to seven default task properties, six primary sidebar destinations and current scroll regions (up to three). The scheduling target appears inside a group only during a contextual drag. Reuse existing date and title slots, tree keys, menus and pickers. No new shortcut is needed.

## Risks / Trade-offs

- A raw count of rendered rows can include context. Test header counts, sidebar count, time totals, slot allocation and every bulk entry point independently.
- Incoming updates can move a row between ordinary, contextual and absent. Test date edits, completion, collapse and parent visibility. Include Today grouped by project and Start with Today in Upcoming so the shared list helper cannot introduce duplicates.
- Drift between drag preview and commit could let a move land on a task that became ineligible. Recheck permissions, current parent, destination and cycle rules at drop time. Test each drop and its Undo against the same on-screen destination and the actual stored values.
- Keep the child lookup outside the per-group and per-parent loops. Preserve stable rows when an unrelated task changes. The current bundle and performance limits still apply.
