## MODIFIED Requirements

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

### Requirement: Reset
On Today, Upcoming and the Inbox, while any option differs from that view's default, the panel SHALL end with **Reset**, which puts every option of that view back to its default at once. The Reset button SHALL not be shown while the view is at its defaults. After Reset, focus SHALL move to the panel's first control. Reset SHALL change only the view it is used on. Reset on Today SHALL clear its saved manual order.

#### Scenario: Back to the default
- **WHEN** Today is grouped by project, ordered by title and nests subtasks, and the user chooses Reset
- **THEN** Today shows Time of day in due-date order with flat subtasks, Reset is no longer shown, and focus is on Rows

#### Scenario: Only this view
- **WHEN** both Today and the Inbox are ordered by priority and the user chooses Reset on Today
- **THEN** the Inbox stays ordered by priority
