## MODIFIED Requirements

### Requirement: Upcoming starts with Today's own groups
While Start with Today is on, Upcoming SHALL open with the groups Today shows, chosen and grouped by the same rules as Today: Earlier, Today (with Morning and Afternoon when the account groups by part of the day), This Evening, Blocked and, with a Today limit, Waiting for a slot. These groups SHALL follow Today's display options (OpenSpec `builtin-view-options`), so they are laid out as Today lays them out; Upcoming's own display options SHALL apply from Tomorrow on. Tomorrow and the following days SHALL follow as without the option. Each task SHALL be listed once: a task Today holds SHALL appear only in Today's groups. Without filters, the Today groups SHALL hold the same tasks as Today, so their count agrees with Today and its sidebar count. The Today group SHALL carry its heading and SHALL be left out when it holds no task. Done today and Close the day SHALL stay on Today only, and a drop on a part-of-the-day heading in Upcoming SHALL never change the task's part: Today's day groups (Today, Morning, Afternoon, This Evening) SHALL take a dragged task only to move it to today, keeping its time and part (manual-ordering "Drag a task to another day in Upcoming"), and Earlier, Blocked, Waiting for a slot and the headings of another grouping chosen for Today SHALL take none. Today SHALL be unchanged.

#### Scenario: Combined list
- **WHEN** the option is on and the user has a task due yesterday, one due today, one for this evening and one due tomorrow
- **THEN** Upcoming shows Earlier, Today, This Evening and Tomorrow, each with its task, in that order

#### Scenario: Listed once
- **WHEN** a task is due tomorrow and its deadline was yesterday
- **THEN** it is listed under Earlier only, as in Today

#### Scenario: Today limit
- **WHEN** the Today limit is 3 and Today holds 5 tasks
- **THEN** Upcoming's Today groups hold the same 3 tasks as Today, the other 2 are in a folded Waiting for a slot group before Tomorrow, and no task after today takes a slot

#### Scenario: Repeating occurrences
- **WHEN** Show repeating occurrences is also on
- **THEN** the projected rows start on Tomorrow and Today's groups stay first

#### Scenario: Today unchanged
- **WHEN** the option is on and the user opens Today
- **THEN** Today lists the same tasks and groups as with the option off

#### Scenario: Drop on Today's groups
- **WHEN** the option is on and the user drags a task due Friday onto This Evening in Upcoming
- **THEN** it is due today with its time kept, and its evening flag and part of the day are unchanged

#### Scenario: Today grouped by project
- **WHEN** the option is on, Today is grouped by project and Upcoming is ordered by title
- **THEN** Upcoming starts with Earlier and today's tasks under their project headings as on Today, and Tomorrow onwards list their tasks by title
