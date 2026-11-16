# builtin-view-options Specification

## Purpose
Lets a person change how Today, Upcoming and the Inbox are laid out (row layout, grouping, order, direction and nested subtasks) from the same Display options panel as projects, labels and saved views. The choices are kept per view in synced personal preferences, Reset goes back to the default, and each view keeps what it means.

## Requirements

### Requirement: Display options on Today, Upcoming and the Inbox
Today, Upcoming and the Inbox SHALL offer the display panel of saved views (OpenSpec `custom-views` "Display panel") from a display button among the header's actions, and below 768 px in the phone bar's slot that project and label pages use. The panel SHALL show only these parts:
- **Today:** Rows (One line, Detailed); Group by: Time of day (default), Project, Priority, Label or None; Order by: Due date (default), Priority, Created, Deadline, Title or a sortable Number or Date custom field; the direction under More options (ascending by default); Nest subtasks (off by default).
- **Upcoming:** Rows; Later days: Summarised (default) or In full (see "Calm Upcoming"); Order by with the same choices as Today; the direction; Nest subtasks. No Group by.
- **Inbox:** Rows; Group by: None (default), Due date, Priority or Label; Order by: Manual order (default), Priority, Due date, Created, Deadline or Title; the direction. No Nest subtasks, because the Inbox always shows subtasks under their parent.

None of the three SHALL offer Layout, Completed tasks or Show on rows. Today SHALL offer Manual order only with Project grouping. Upcoming SHALL offer no Manual order. A choice SHALL apply at once. Rows SHALL show the account's row layout until the view has its own choice. Custom-field orders SHALL be matched and sorted as on a label page (OpenSpec `list-display-options` "Display options on project and label pages").

#### Scenario: Today's choices
- **WHEN** the user opens Display options on Today
- **THEN** Group by offers Time of day, Project, Priority, Label and None with Time of day chosen, Order by offers Due date, Priority, Created, Deadline and Title with Due date chosen, and Nest subtasks is off

#### Scenario: Upcoming has no grouping
- **WHEN** the user opens Display options on Upcoming
- **THEN** the panel shows Rows, Later days with Summarised chosen, Order by, More options and Nest subtasks, and no Group by

#### Scenario: Inbox's choices
- **WHEN** the user opens Display options on the Inbox
- **THEN** Group by offers None, Due date, Priority and Label, Order by offers Manual order first, and no Nest subtasks switch is shown

#### Scenario: Phone
- **WHEN** the user opens Today on a 375 px screen
- **THEN** the display button is in the bar's slots, and the panel opens as a bottom sheet

### Requirement: Defaults are each view as before
With every option at its default, Today, Upcoming and the Inbox SHALL list the same tasks, in the same groups, in the same order, with the same rows as before this change. Opening a view or its panel SHALL write nothing.

#### Scenario: Existing account after the upgrade
- **WHEN** a user who had the app before this change opens Today, Upcoming and the Inbox
- **THEN** each shows the same groups, order and rows as before, and no operation is written

### Requirement: What each view keeps
Display options SHALL change how a view lays out its tasks and never which tasks it lists. Each view's task count, its sidebar count, the icon badge and the day page's briefing SHALL be unchanged by them. The Today and Upcoming duration filter, Upcoming's query filter, Today's Hide tasks assigned to others, Show calendar events and Start with Today SHALL work as before under any option.

In Today, the chosen grouping SHALL lay out only the day's own tasks, which Time of day shows under Today, Morning, Afternoon and This Evening. **Earlier** SHALL stay the first group with its actions. **Blocked**, **Waiting for a slot** and **Done today** SHALL stay at the end, in that order, folded as before. The chosen order SHALL apply within Earlier, within each chosen group and within Blocked. Waiting for a slot SHALL keep its fill order, and Done today SHALL stay newest first. Grouping by Project, Priority or Label SHALL use the headings and order of a saved view's grouping, listing each task once (a task with several labels under the first of them in label order). Under Group by Project, rows SHALL leave out the project their heading names. Under any grouping other than Time of day, a task's part of the day SHALL show on its row. Time of day's headings SHALL take day-part drops. Today under Project grouping SHALL take project drops as specified in OpenSpec manual-ordering. Manual order SHALL apply to the active project groups and Inbox. While it is selected, Earlier, Blocked and the Today portion of Upcoming SHALL use Today's default order.

The Today limit SHALL fill its slots as before, whatever the grouping and order: the same tasks hold the slots, and the lead line counts them the same way.

In Upcoming, one group per day SHALL stay. The chosen order SHALL apply within each day, and a drop on a day SHALL keep moving the task to that day.

In the Inbox, grouping and order SHALL apply to top-level tasks, each keeping its subtasks under it in their manual order. Process the Inbox SHALL keep its queue in the Inbox's manual order.

#### Scenario: Today by project
- **WHEN** Today holds a task due yesterday in "Home", two tasks due today in "Work" and one in "Home", and one blocked task, and the user chooses Group by Project
- **THEN** Today shows Earlier with the late task, then "Home" and "Work" with today's tasks under them, then Blocked folded, and Earlier still offers Move all to today

#### Scenario: Order inside Earlier
- **WHEN** Today is ordered by priority, descending, and Earlier holds a priority-3 task due Monday and a priority-1 task due Tuesday
- **THEN** Earlier lists the priority-1 task first

#### Scenario: Slots do not move
- **WHEN** the Today limit is 3, Today holds five available tasks, and the user orders Today by title
- **THEN** the same three tasks hold the slots as before, listed by title, the other two stay in Waiting for a slot in fill order, and the lead line still reads "3 of 3"

#### Scenario: Upcoming by priority
- **WHEN** Thursday holds a priority-4 task at 09:00 and a priority-1 task with no time, and the user orders Upcoming by priority, descending
- **THEN** Thursday lists the priority-1 task first, and dragging a task onto Friday still moves it to Friday

#### Scenario: Inbox by priority
- **WHEN** the Inbox is grouped by priority and a priority-2 task has a priority-4 subtask
- **THEN** the subtask is listed under its parent in "Priority 2", indented

#### Scenario: Count unchanged
- **WHEN** the user groups Today by label
- **THEN** Today's sidebar count and the icon badge show the same number as before

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

### Requirement: Reset
On Today, Upcoming and the Inbox, while any option differs from that view's default, the panel SHALL end with **Reset**, which puts every option of that view back to its default at once. The Reset button SHALL not be shown while the view is at its defaults. After Reset, focus SHALL move to the panel's first control. Reset SHALL change only the view it is used on. Reset on Today SHALL clear its saved manual order.

#### Scenario: Back to the default
- **WHEN** Today is grouped by project, ordered by title and nests subtasks, and the user chooses Reset
- **THEN** Today shows Time of day in due-date order with flat subtasks, Reset is no longer shown, and focus is on Rows

#### Scenario: Only this view
- **WHEN** both Today and the Inbox are ordered by priority and the user chooses Reset on Today
- **THEN** the Inbox stays ordered by priority

### Requirement: Built-in view options are stored per view and synced
Each view's options SHALL be stored in the user's personal preferences, separately for Today, Upcoming and the Inbox, as one operation per changed field written locally first. They SHALL work offline, follow the user to their own devices after sync, survive a restart and never reach other members of a shared project. Concurrent changes SHALL converge per field (last writer wins): a grouping changed on one device and an order changed on another SHALL both survive. A missing, empty, unknown or not-offered stored value SHALL read as that option's default and SHALL not be rewritten. A client that does not know these options SHALL show the views as before and keep the stored values. The values are settings, not content: they SHALL not be encrypted and SHALL be included in the export and restored by its import.

#### Scenario: Offline and synced
- **WHEN** the user groups Today by priority on the laptop while offline, then reconnects and opens Today on the phone
- **THEN** the laptop shows the grouping at once and the phone shows it after sync

#### Scenario: Two devices, two fields
- **WHEN** the laptop groups the Inbox by label offline while the phone orders the Inbox by title offline, and both sync
- **THEN** every device shows the Inbox grouped by label and ordered by title

#### Scenario: Value from a newer client
- **WHEN** a newer client stores a grouping on Today that this version does not know
- **THEN** this version shows Today by Time of day and leaves the stored value unchanged

#### Scenario: Not a project member's business
- **WHEN** Ana groups Today by project and Ben shares a project with her
- **THEN** Ben's Today is unchanged

### Requirement: Moving a task in the Inbox switches to manual order
In the Inbox shown in another order than Manual order ascending, dropping a dragged task among its rows, or moving it with Alt+Up, Alt+Down, Alt+Shift+Up or Alt+Shift+Down, SHALL first set the Inbox's order to Manual order ascending and then apply the move as in manual order. The grouping SHALL stay.

#### Scenario: Drag under a priority order
- **WHEN** the Inbox is ordered by priority and the user drags "Buy bulbs" below "Call plumber"
- **THEN** the Inbox's order becomes Manual order and "Buy bulbs" is placed after "Call plumber"

### Requirement: Calm Upcoming
Upcoming's display panel SHALL offer **Later days**: Summarised (the default) or In full. The choice is stored in the user's synced preferences for Upcoming, is written locally first, works offline and converges by last-writer-wins. An empty or unknown value reads as Summarised.

While Summarised is chosen:
- The first three days that have tasks SHALL be listed in full, as today.
- Every later day SHALL be a closed group bar showing the day, its task count and, in the faint tone and cut with an ellipsis, the titles of its first tasks.
- Activating a bar, or → or Enter on it, SHALL open that day in place, and ← SHALL close it again. Opening and closing are kept on the device only, like other collapsed groups.
- `j` and `k` SHALL move between visible rows and closed bars.
- Dropping a dragged task on a closed bar SHALL move the task to that day.
- A day's calendar events, when shown, SHALL count toward neither the three days nor the bar's count.

Everything is presentation only: nothing is written by opening or closing a day.

#### Scenario: A full fortnight
- **WHEN** Upcoming holds tasks on twelve of the next fourteen days and Later days is Summarised
- **THEN** the first three of those days are listed in full, and each of the nine later days is one bar such as "Thu 19 Nov · 6 · Dentist, Pay rent, Call Ana…"

#### Scenario: Open a day
- **WHEN** the user moves to the bar of Thursday with `j` and presses Enter
- **THEN** Thursday's six tasks are listed under its bar, ← closes them again, and the other bars stay closed

#### Scenario: Everything in full
- **WHEN** the user chooses In full in Upcoming's display panel on the laptop
- **THEN** every day is listed in full there at once and on the phone after sync

#### Scenario: Drop on a closed day
- **WHEN** the user drags a task from Tomorrow onto the closed bar of Monday
- **THEN** the task is due Monday, Monday's count rises by one, and Undo puts it back

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
