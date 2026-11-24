## MODIFIED Requirements

### Requirement: Task page
A task opened from a list SHALL remember that list: its address, its name, its tasks in display order and its scroll position. The page SHALL show the task's place in that list as "n / m" with controls for the next and previous task, and `j` and `k` SHALL open the next and previous task in place, so Escape still returns in one step. Opening any other task from the page (a subtask, the parent, a related task) SHALL add a history entry, so the browser's Back or the back gesture returns to the task it was opened from; Escape and Close SHALL still return to the list in one step, without leaving an extra entry. Escape (outside a text field and outside an overlay), Close and the phone's Back SHALL return to that list with the task selected and the list scrolled where it was. A task opened from outside a list (a reminder, a notification, the command palette) SHALL return to the task's own list (its project, or the Inbox); a task opened from its address alone (a reload, a link) SHALL show no place in a list and SHALL return to the task's own list with the task selected. Addresses of the form `?task=<id>` SHALL keep working and open the task's page over the page in the address.

#### Scenario: Step through a list
- **WHEN** the user opens the second of three tasks in a project and presses `j`
- **THEN** the third task's page shows "3 / 3", the next control is disabled, and a further `j` does nothing

#### Scenario: Back from a subtask's page
- **WHEN** the user opens a task from the Inbox, opens one of its subtasks from the page and uses the browser's Back
- **THEN** the parent task's page shows; Escape there, or on the subtask's page instead, returns to the Inbox in one step

#### Scenario: Back to the same spot
- **WHEN** the user scrolled Upcoming down, opened a task, stepped to the next one with `j` and pressed Escape
- **THEN** Upcoming shows at the same scroll position with the task last shown selected, and the browser's history holds no extra entry

#### Scenario: Opened from a link
- **WHEN** the user opens `/task/<id>` of a task in the Inbox from a bookmark and chooses Close
- **THEN** the Inbox opens with that task selected

#### Scenario: Older link
- **WHEN** the user opens `/upcoming?task=<id>`
- **THEN** the task's page opens, and Escape returns to Upcoming
