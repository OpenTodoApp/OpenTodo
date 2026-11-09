## Purpose

Lets a person change how Today, Upcoming and the Inbox are laid out (row layout, grouping, order, direction and nested subtasks) from the same Display options panel as projects, labels and saved views. The choices are kept per view in synced personal preferences, Reset goes back to the default, and each view keeps what it means.

## ADDED Requirements

### Requirement: Display options on Today, Upcoming and the Inbox
Today, Upcoming and the Inbox SHALL offer the display panel of saved views (OpenSpec `custom-views` "Display panel") from a display button among the header's actions, and below 768 px in the phone bar's slot that project and label pages use. The panel SHALL show only these parts:
- **Today:** Rows (One line, Detailed); Group by: Time of day (default), Project, Priority, Label or None; Order by: Due date (default), Priority, Created, Deadline, Title or a sortable Number or Date custom field; the direction under More options (ascending by default); Nest subtasks (off by default).
- **Upcoming:** Rows; Order by with the same choices as Today; the direction; Nest subtasks. No Group by.
- **Inbox:** Rows; Group by: None (default), Due date, Priority or Label; Order by: Manual order (default), Priority, Due date, Created, Deadline or Title; the direction. No Nest subtasks, because the Inbox always shows subtasks under their parent.

None of the three SHALL offer Layout, Completed tasks or Show on rows. Today and Upcoming SHALL offer no Manual order. A choice SHALL apply at once. Rows SHALL show the account's row layout until the view has its own choice. Custom-field orders SHALL be matched and sorted as on a label page (OpenSpec `list-display-options` "Display options on project and label pages").

#### Scenario: Today's choices
- **WHEN** the user opens Display options on Today
- **THEN** Group by offers Time of day, Project, Priority, Label and None with Time of day chosen, Order by offers Due date, Priority, Created, Deadline and Title with Due date chosen, and Nest subtasks is off

#### Scenario: Upcoming has no grouping
- **WHEN** the user opens Display options on Upcoming
- **THEN** the panel shows Rows, Order by, More options and Nest subtasks, and no Group by

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

In Today, the chosen grouping SHALL lay out only the day's own tasks, which Time of day shows under Today, Morning, Afternoon and This Evening. **Earlier** SHALL stay the first group with its actions. **Blocked**, **Waiting for a slot** and **Done today** SHALL stay at the end, in that order, folded as before. The chosen order SHALL apply within Earlier, within each chosen group and within Blocked. Waiting for a slot SHALL keep its fill order, and Done today SHALL stay newest first. Grouping by Project, Priority or Label SHALL use the headings and order of a saved view's grouping, listing each task once (a task with several labels under the first of them in label order). Under Group by Project, rows SHALL leave out the project their heading names. Under any grouping other than Time of day, a task's part of the day SHALL show on its row. Only Time of day's headings SHALL take drops.

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
With Nest subtasks on, Today and Upcoming SHALL list a subtask under its parent when the parent is listed in the same group, indented one level per depth, with the collapse toggle, the per-device collapsed state and the Left and Right keys of a project's tree, and announced with its level as in a project. A subtask whose parent is not listed in that group SHALL stay a row of its own with the breadcrumb naming its parent. The chosen order SHALL apply to the group's top-level rows, and subtasks SHALL keep their manual order under their parent. No task outside the view SHALL be shown. Counts, slots and selection SHALL count tasks as before. Off, the views SHALL list subtasks flat, as before.

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

### Requirement: Reset
On Today, Upcoming and the Inbox, while any option differs from that view's default, the panel SHALL end with **Reset**, which puts every option of that view back to its default at once. The Reset button SHALL not be shown while the view is at its defaults. After Reset, focus SHALL move to the panel's first control. Reset SHALL change only the view it is used on.

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
