# list-display-options Specification

## Purpose
Defines the display options of a project's list and a label's page: grouping and order chosen in the views' display panel, stored per project and per label for the user, synced, and switched back to manual order by a manual move.

## Requirements

### Requirement: Display options on project and label pages
A project page in the List layout and a label page SHALL offer the display panel of saved views (OpenSpec `custom-views` "Display panel") from a display button among the header's actions (in the phone bar's slots below 768 px), with **Group by** and **Order by** and the direction under **More options**, and without the layout, completed tasks and row properties parts. A project SHALL offer grouping by Section (default), None, Due date, Priority or Label; a label page by Project (default), None, Due date or Priority. Both SHALL offer ordering by Manual order, Priority, Due date, Created, Deadline, Title or a sortable Number or Date custom field (OpenSpec `custom-fields` "Sortable custom field values"), ascending or descending. Custom-field options SHALL be matched case-insensitively by name and shown once; if matching definitions have different types across tasks, Number values SHALL sort before Date values, followed by Text values in both directions, with values reversed within each type descending; missing values SHALL remain last in either direction. A choice SHALL apply at once. A project's Board and Timeline layouts SHALL not show the panel and SHALL be unchanged by it.

#### Scenario: Choose a custom field order on a project
- **WHEN** the user opens Display options on a project with a live Number field named "WSJF" and chooses WSJF
- **THEN** the project's list orders its tasks by their WSJF values and the choice is stored for that project only

#### Scenario: Choose a custom field order on a label page
- **WHEN** the user opens Display options on a label whose tasks span projects with same-named Number fields
- **THEN** Order by offers that field once and the label's tasks are ordered by the values from their respective project definitions

#### Scenario: Group a project by priority
- **WHEN** the user opens Display options on the project "Home" and chooses Group by Priority
- **THEN** the list shows the headings "Priority 1" and "Priority 2" with the project's tasks under them, and the choice is stored for "Home" only

#### Scenario: Choices of a label page
- **WHEN** the user opens Display options on the label "errand"
- **THEN** Group by offers Project, None, Due date and Priority, and Order by offers Manual order, Priority, Due date, Created, Deadline, Title and applicable Number and Date custom fields

#### Scenario: Board unchanged
- **WHEN** a project grouped by priority is switched to the Board layout
- **THEN** the board shows one column per section as before and the header shows no display button

### Requirement: Grouping and order of a project or label list
Grouping and order SHALL apply to a project's top-level tasks; each SHALL keep its subtasks under it in their manual order. Groups SHALL have the headings and order of a saved view's grouping (due date: Earlier, Today, Tomorrow, each later date, No date; priority: Priority 1 to 4; label: the labels in label order, then No label). A task SHALL be listed once: a task with several labels under the first of them in label order. Grouping by Section SHALL keep the project's sections with their headers, collapsing, adding and dropping, ordering the tasks inside each; None SHALL list the tasks without headings. Due date, deadline and custom-field orders SHALL list tasks without a value last in either direction; for priority, descending SHALL put priority 1 first. Equal custom-field values SHALL fall back to due date, priority, position and task id, in that order. Grouped by Section, a project's deferred and parked tasks SHALL stay in their section under its Later (OpenSpec `start-dates` "Deferred tasks"), in the section's order; under every other grouping, in a project without sections and on the timeline, a project's Later group SHALL stay at the end. The Completed group SHALL stay at the end. The defaults SHALL show what the pages showed before: a project by section in manual order, a label by project in manual order.

#### Scenario: Order inside sections by a custom field
- **WHEN** a project with sections is ordered by its Number field "Effort", descending
- **THEN** each section lists tasks with the greatest Effort first, tasks without Effort last, and the sections keep their order and headers

#### Scenario: Keep subtasks and Later tasks in place
- **WHEN** a project is ordered by a custom field and a top-level task has subtasks
- **THEN** its subtasks remain under it in manual order, each section's Later stays after the section's active tasks, and the Completed group remains at the end

#### Scenario: Subtasks stay with their parent
- **WHEN** a project is grouped by priority and a priority-2 task has a priority-4 subtask
- **THEN** the subtask is listed under its parent in the "Priority 2" group, indented

#### Scenario: Order inside sections
- **WHEN** a project with sections is ordered by priority, descending
- **THEN** each section lists its priority-1 tasks first, and the sections keep their order and headers

#### Scenario: Several labels
- **WHEN** a project is grouped by label and a task carries "work" and "call", with "call" first in the label order
- **THEN** the task is listed once, under "call"

#### Scenario: Later at the end under another grouping
- **WHEN** a project with sections and a deferred task is grouped by priority
- **THEN** the deferred task is listed in one Later group after the priority groups

### Requirement: Display options are stored per project and per label
A project's options SHALL be stored in the user's personal preferences row of that project and a label's on the label, as one operation per field written locally first, so they work offline, follow the user to their own devices after sync and survive a restart. On a shared project each member SHALL keep their own options; a viewer may set theirs. Concurrent changes SHALL converge per field (last writer wins): a grouping changed on one device and an order changed on another both survive. A missing, empty or unknown stored value SHALL read as the default without being rewritten.

#### Scenario: Survives a restart and syncs
- **WHEN** the user orders the label "errand" by deadline on the laptop, offline, then reconnects and opens "errand" on the phone after a restart
- **THEN** the phone lists the errands by deadline

#### Scenario: Personal on a shared project
- **WHEN** Ana groups the shared project "Launch" by due date
- **THEN** Ben, a member, still sees "Launch" by section

#### Scenario: Unknown value
- **WHEN** a newer client stores an order this version does not know on a project
- **THEN** this version shows the project in manual order and leaves the stored value unchanged

### Requirement: Moving a task switches to manual order
On a project or label page shown in another order than manual ascending, dropping a dragged task among its rows, or moving it with Alt+Up, Alt+Down, Alt+Shift+Up or Alt+Shift+Down, SHALL first set the page's order to Manual order (ascending) and then apply the move as in manual order; the grouping SHALL stay. On a label page the move SHALL change the label page's own manual order (OpenSpec `manual-ordering`, "Manual order of a label page or saved view"), never the tasks' project positions. A drop on a section heading or a sidebar target SHALL leave the order unchanged.

#### Scenario: Drag under a priority order
- **WHEN** a project is ordered by priority and the user drags "Buy bulbs" below "Call plumber"
- **THEN** the project's order becomes Manual order and "Buy bulbs" is placed after "Call plumber" in the manual order

#### Scenario: Keyboard move under a title order
- **WHEN** a project is ordered by title and the user presses Alt+Down on its first task
- **THEN** the order becomes Manual order and the task moves one place down in it

#### Scenario: Label page under a deadline order
- **WHEN** the label page "errand" is ordered by deadline and the user presses Alt+Up on its second task
- **THEN** the label page's order becomes Manual order, the task is first on the page, and its project is unchanged

### Requirement: Display options from the keyboard
A project's list, a label's page and a saved view SHALL let the user change Group by, Order by and the direction from the keyboard (OpenSpec `keyboard-shortcuts`, "Group and order keys"), with the choices the page's panel offers except custom-field orders. A keyed change SHALL be the same change as the panel's: the same stored fields, one operation per changed field written locally first, offline and per-field convergence as in "Display options are stored per project and per label", personal on a shared project. Choosing the value already in effect SHALL write nothing.

#### Scenario: Same as the panel
- **WHEN** the user presses `r o t` on the label "errand" and then opens Display options
- **THEN** the panel shows Order by Title, the label's stored order is Title, and the phone lists the errands by title after it syncs

#### Scenario: Personal on a shared project
- **WHEN** Ana presses `r g d` in the shared project "Launch"
- **THEN** her list is grouped by due date and Ben still sees "Launch" by section

#### Scenario: Nothing to write
- **WHEN** a project is grouped by priority and the user presses `r g p`
- **THEN** no operation is queued and the notice reads "Group by: Priority"
