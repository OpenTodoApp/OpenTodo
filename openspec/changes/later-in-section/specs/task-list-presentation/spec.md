## MODIFIED Requirements

### Requirement: Group headers
Date groups, section groups, project groups, the Earlier group, the "Later" group and the Completed group SHALL use one header: a label, a count, a collapse control, and trailing actions. In a list the header SHALL be a group bar: a 32 px strip filled with the raised surface, with the label at the metadata size in the medium weight and the default text tone, in sentence case whether the view generated the group (a date, Earlier, Today, This Evening, Blocked, Later, Completed, No section) or the user named it (a section, a project, a label); on a board column the header SHALL stay a plain heading on the column's surface, and so SHALL a section's own Later heading inside the section, so the section's bar stays the only bar. The count SHALL be in the faint tone with tabular figures. Trailing actions SHALL appear on hover, focus or touch, except the actions of the Earlier group, which SHALL be visible at all times. No group header SHALL use the danger tone. Collapse state SHALL be remembered per device; the Earlier group of Today SHALL be collapsed by default on a device that never opened or closed it while it holds more than five tasks, and open by default otherwise. This is presentation only and behaves the same offline.

#### Scenario: Collapse a date group
- **WHEN** the user collapses "Tomorrow" in Upcoming and reloads
- **THEN** "Tomorrow" stays collapsed on this device and shows its count

#### Scenario: A generated and a named group
- **WHEN** Upcoming shows the "Tomorrow" group and a project shows its "Planning" section
- **THEN** "Tomorrow" and "Planning" are both group bars in sentence case at the metadata size, medium weight, in the default text tone, with their counts in the faint tone

#### Scenario: Earlier is quiet
- **WHEN** Today lists three tasks due before today
- **THEN** the first group bar reads "Earlier" in the default text tone with "3" in the faint tone, each task's date is in the danger tone, and no other part of the group is red

#### Scenario: Earlier collapsed by default
- **WHEN** a user who never touched the group opens Today with eight tasks due before today
- **THEN** the Earlier group shows its label, "8", "Move all to today" and "Reschedule…" and no rows, and opening it is remembered on this device

#### Scenario: Earlier open by default
- **WHEN** a user who never touched the group opens Today with two tasks due before today
- **THEN** the Earlier group shows its two rows

#### Scenario: A section's Later heading
- **WHEN** the section "Garden" holds two active tasks and one deferred task
- **THEN** after the two rows the section shows a plain "Later" heading with "1" in the faint tone and a collapse control, without the raised fill

### Requirement: Empty groups
A group with no open tasks SHALL be hidden when it is generated (a date, "No section", "Later"; "No section" counts the tasks in its Later), and SHALL show only its header when it is user-created (a section). A section whose tasks are all completed SHALL show "n completed" in its header with a control that reveals them, except while the project shows its Completed group, which holds those tasks.

#### Scenario: Done section
- **WHEN** a project's "Done" section holds two completed tasks and no open one
- **THEN** its header reads "Done · 2 completed" with a Show control, and no empty body is rendered

#### Scenario: Done section with the Completed group on
- **WHEN** the same project has "Show completed tasks" on
- **THEN** the "Done" header shows no "n completed" and no Show control, and the two tasks are in the Completed group at the end of the list
