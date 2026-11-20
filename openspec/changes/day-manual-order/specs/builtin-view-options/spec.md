## ADDED Requirements

### Requirement: Manual order of the day
Today and Upcoming SHALL share one personal day order: the existing synced `today_manual_order` list of the user's preferences (at most 500 task ids), so a task placed in Upcoming's Thursday keeps that place in Today on Thursday. Under Manual order, a day's tasks SHALL be listed with the placed ones in the stored order and the others after them in the view's default order (Due date), so nothing moves until the user moves something. A drag among the rows of one group, `Alt+Up` and `Alt+Down` (with Shift, to the first or last place of the group) and Move up, Move down and Move to top in the row menu SHALL place the task within its group: in Today, within its part of the day, project, priority or label group; in Upcoming, within its day. A drop between the rows of another group SHALL do what a drop on that group's heading does today (set the part of the day in Today grouped by Time of day, move the project under Project grouping, move the task to that day in Upcoming) and place it at the line, in one change with one Undo; under Priority or Label grouping, a drop SHALL stay within the task's group. A task with a due time SHALL keep its time: in Today grouped by Time of day it SHALL only be placed among the tasks of the part its time or stored part gives, and a drop into another part SHALL set the part as the heading drop does. Each move SHALL be applied locally first, work offline and converge by last-writer-wins on the whole list, as a saved view's manual order does. Reset of Today's display options SHALL clear the list. Viewers of a shared project SHALL be able to order their own day, because the list is theirs.

#### Scenario: Rearranging tomorrow
- **WHEN** Upcoming is ordered by Manual order and the user drags "Call the bank" above "Gym" on Thursday
- **THEN** Thursday lists "Call the bank" before "Gym", and on Thursday Today lists them in that order too

#### Scenario: Into the evening
- **WHEN** Today is grouped by Time of day under Manual order and the user drags an untimed task between the two tasks under This Evening
- **THEN** the task is set to Evening and listed between them, and one Undo puts it back where it was with its part

#### Scenario: Offline on two devices
- **WHEN** a phone and a laptop each reorder Today offline and then sync
- **THEN** both show the order written last, every task listed exactly once

### Requirement: Part of the day in the due order
Ordered by Due date, the tasks of one day SHALL be listed by part of the day, in the order Time of day groups them: tasks with neither a part nor a due time first (the day's own tasks), then Morning, Afternoon and This Evening, a task's part being its stored part or, without one, the part its due time falls in (OpenSpec `day-parts`). Within a part, tasks with a due time SHALL come by time, then those without, then by the existing tie-breaks. This SHALL apply in Upcoming's days and in Today under every grouping, so a grouping other than Time of day keeps the day's shape. It SHALL apply only while day parts are on; with them off, the order SHALL be as before.

#### Scenario: Upcoming's Thursday
- **WHEN** day parts are on and Thursday holds an Evening task, an untimed task without a part, a task due at 09:00 and a Morning task without a time
- **THEN** Upcoming lists the untimed task, the 09:00 task, the Morning task and the Evening task, in that order

#### Scenario: Day parts off
- **WHEN** day parts are off
- **THEN** Upcoming orders Thursday's tasks by due date as before

## MODIFIED Requirements

### Requirement: Display options on Today, Upcoming and the Inbox
Today, Upcoming and the Inbox SHALL offer the display panel of saved views (OpenSpec `custom-views` "Display panel") from a display button among the header's actions, and below 768 px in the phone bar's slot that project and label pages use. The panel SHALL show only these parts:
- **Today:** Rows (One line, Detailed); Group by: Time of day (default), Project, Priority, Label or None; Order by: Due date (default), Manual order, Priority, Created, Deadline, Title or a sortable Number or Date custom field; the direction under More options (ascending by default); Nest subtasks (off by default).
- **Upcoming:** Rows; Later days: Summarised (default) or In full (see "Calm Upcoming"); Order by with the same choices as Today, Manual order included; the direction; Nest subtasks. No Group by.
- **Inbox:** Rows; Group by: None (default), Due date, Priority or Label; Order by: Manual order (default), Priority, Due date, Created, Deadline or Title; the direction. No Nest subtasks, because the Inbox always shows subtasks under their parent.

None of the three SHALL offer Layout, Completed tasks or Show on rows. Today SHALL offer Manual order under every grouping, and Upcoming SHALL offer it too (see "Manual order of the day"). A choice SHALL apply at once. Rows SHALL show the account's row layout until the view has its own choice. Custom-field orders SHALL be matched and sorted as on a label page (OpenSpec `list-display-options` "Display options on project and label pages").

#### Scenario: Today's choices
- **WHEN** the user opens Display options on Today
- **THEN** Group by offers Time of day, Project, Priority, Label and None with Time of day chosen, Order by offers Due date, Manual order, Priority, Created, Deadline and Title with Due date chosen, and Nest subtasks is off

#### Scenario: Upcoming has no grouping
- **WHEN** the user opens Display options on Upcoming
- **THEN** the panel shows Rows, Later days with Summarised chosen, Order by, More options and Nest subtasks, and no Group by

#### Scenario: Inbox's choices
- **WHEN** the user opens Display options on the Inbox
- **THEN** Group by offers None, Due date, Priority and Label, Order by offers Manual order first, and no Nest subtasks switch is shown

#### Scenario: Phone
- **WHEN** the user opens Today on a 375 px screen
- **THEN** the display button is in the bar's slots, and the panel opens as a bottom sheet

### Requirement: What each view keeps
Display options SHALL change how a view lays out its tasks and never which tasks it lists. Each view's task count, its sidebar count, the icon badge and the day page's briefing SHALL be unchanged by them. The Today and Upcoming duration filter, Upcoming's query filter, Today's Hide tasks assigned to others, Show calendar events and Start with Today SHALL work as before under any option.

In Today, the chosen grouping SHALL lay out only the day's own tasks, which Time of day shows under Today, Morning, Afternoon and This Evening. **Earlier** SHALL stay the first group with its actions. **Blocked**, **Waiting for a slot** and **Done today** SHALL stay at the end, in that order, folded as before. The chosen order SHALL apply within Earlier, within each chosen group and within Blocked. Waiting for a slot SHALL keep its fill order, and Done today SHALL stay newest first. Grouping by Project, Priority or Label SHALL use the headings and order of a saved view's grouping, listing each task once (a task with several labels under the first of them in label order). Under Group by Project, rows SHALL leave out the project their heading names. Under any grouping other than Time of day, a task's part of the day SHALL show on its row. Time of day's headings SHALL take day-part drops. Today under Project grouping SHALL take project drops as specified in OpenSpec manual-ordering. Manual order SHALL apply to the day's own groups under any grouping. While it is selected, Earlier and Blocked SHALL use Today's default order.

The Today limit SHALL fill its slots as before, whatever the grouping and order: the same tasks hold the slots, and the lead line counts them the same way.

In Upcoming, one group per day SHALL stay. The chosen order SHALL apply within each day, Manual order included, and a drop on a day SHALL keep moving the task to that day.

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
