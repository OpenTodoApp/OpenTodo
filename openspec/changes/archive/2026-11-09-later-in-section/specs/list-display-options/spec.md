## MODIFIED Requirements

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
