## MODIFIED Requirements

### Requirement: Nest subtasks in Today and Upcoming
With Nest subtasks on, Today and Upcoming SHALL list a subtask under its parent when the parent is listed in the same group, indented one level per depth, with the collapse toggle, the per-device collapsed state and the Left and Right keys of a project's tree, and announced with its level as in a project. A subtask whose parent is not listed in that group SHALL stay a row of its own with the breadcrumb naming its parent. The chosen order SHALL apply to the group's top-level rows, and subtasks SHALL keep their manual order under their parent. With nesting off, both views SHALL list subtasks flat as before.

On the Today view itself, with nesting on, a task in one of the day's ordinary groups SHALL also show its eligible direct subtasks as context. An eligible subtask SHALL be open, visible under the existing workspace, project, assignee and duration filters, outside Today membership, and either undated or scheduled only on future days. A parked Someday task SHALL keep its existing placement. Context rows SHALL follow the parent's tree and collapse state. A contextual row SHALL be a leaf in the Today tree. Earlier, Blocked, Waiting for a slot and Done today SHALL retain their existing contents. Upcoming SHALL keep its existing membership and nesting rules.

A contextual row SHALL show its own future date information when present, have a visually secondary title and be announced as a contextual subtask on keyboard focus. It SHALL support individual completion, opening and editing with the task's usual permissions. It SHALL be excluded from group and Today counts, time totals, slot membership, bulk selection, bulk rescheduling and Today-specific manual order while it is contextual. Showing context SHALL write no operation. The projection SHALL work offline and update when the existing task data and preferences change or sync. Individual edits SHALL use the usual task operations and convergence rules.

#### Scenario: Parent and child due today
- **WHEN** Nest subtasks is on, "Plan trip" and its subtask "Book flights" are both due today, and "Book flights" has a subtask "Compare prices" also due today
- **THEN** Today lists "Plan trip", then "Book flights" indented one level, then "Compare prices" indented two levels

#### Scenario: Parent in another group
- **WHEN** Nest subtasks is on, "Plan trip" is due yesterday and its subtask "Book flights" is due today
- **THEN** "Plan trip" is under Earlier and "Book flights" is under Today as its own row with the breadcrumb "Plan trip"

#### Scenario: Parent not in the view
- **WHEN** Nest subtasks is on and only the subtask "Compare prices" is due today
- **THEN** Today lists "Compare prices" once with its breadcrumb and does not list its parent

#### Scenario: Collapse
- **WHEN** the user selects "Plan trip" in Today with Nest subtasks on and presses Left
- **THEN** its subtasks are hidden on this device, and Today's count is unchanged

#### Scenario: Open undated and later steps

- **WHEN** a parent due today has an undated child, a child due Friday, a completed child and a child due yesterday, and nesting is on
- **THEN** the undated and Friday children appear once beneath the parent as contextual rows in manual sibling order, the Friday date appears on its row, the completed child is absent from the parent's tree and the overdue child follows Earlier's existing rules

#### Scenario: A child qualifies through another scheduling field

- **WHEN** a child is due Friday and its deadline or start brings it into Today already
- **THEN** regular Today grouping and nesting apply to the child and it is never shown twice

#### Scenario: A contextual child has its own child

- **WHEN** a Today parent has a contextual child that has a child of its own
- **THEN** the contextual child is a leaf on Today and its child appears on Today only if that task independently qualifies there

#### Scenario: Toggle and scope

- **WHEN** the user turns Nest subtasks off or switches to Upcoming with Start with Today
- **THEN** the extra Today rows are absent and any future task that would already appear in Upcoming remains in its own day group

#### Scenario: Focus without bulk selection

- **WHEN** the user navigates to a contextual row by keyboard or uses Select all while viewing the expanded tree
- **THEN** the contextual row is individually actionable but is outside the bulk selection, with the same group count and time totals as before

#### Scenario: A child changes date offline

- **WHEN** the user opens a contextual child and sets its date to today offline
- **THEN** the one ordinary task row replaces the contextual row and the count follows normal Today membership, with the date change and result following the existing sync behavior

## ADDED Requirements

### Requirement: Explicit moves for contextual subtasks in Today

With Group by Project and Nest subtasks on in Today, a contextual subtask SHALL be draggable onto a regular Today task in an eligible group to change its parent. That drop SHALL append it under the target, retaining its dates. Where the target is in another editable project of the same sharing scope, the move SHALL also transfer the subtask and its subtree under the usual project-move rules. Both projects must be editable and the usual parent and cycle checks apply. Contextual rows SHALL be excluded from drop anchors and gap-based ordering.

For the same contextual drag, eligible displayed project groups SHALL offer a distinct **Make top-level for today** target. The target SHALL state the scheduling effect before release. Dropping there SHALL make the subtask a top-level task of the chosen project and set its Do on date to the user's logical today, keeping any existing time and time zone. The task SHALL join normal Today membership and slot handling. The current Today sort SHALL remain in effect. The ordinary project heading SHALL retain its existing behavior for regular rows.

Both operations SHALL have a keyboard-accessible equivalent in the row's Actions menu and use the same destination and permission checks. Each action SHALL work offline and apply as one undoable batch through the existing task operations. One Undo SHALL restore the prior parent, project, placement and any scheduling changes made by the action. The changes SHALL sync and converge per field as usual.

#### Scenario: Reparent without adding a date

- **WHEN** a user drags an undated contextual child onto another regular Today task in the same or another editable project of the same sharing scope
- **THEN** the task becomes a child of the target, keeps its date empty and still contributes no Today count or slot

#### Scenario: Move a future-dated child

- **WHEN** a user reparents a contextual child scheduled for Friday
- **THEN** its date remains Friday and one Undo restores its previous parent, project and position

#### Scenario: Reject a disallowed parent

- **WHEN** a user tries to drop a contextual child on its own descendant, on a task they cannot edit or into a different sharing scope as a subtask
- **THEN** the drop is refused and leaves the task, dates and ordering intact

#### Scenario: Promote and schedule explicitly

- **WHEN** a user drops a contextual subtask onto **Make top-level for today** in an eligible project group
- **THEN** it becomes a regular top-level task in the chosen project and is due today, its placement follows the current sort and slot availability, and one Undo restores its previous parent, project, position and original date or absence of date
