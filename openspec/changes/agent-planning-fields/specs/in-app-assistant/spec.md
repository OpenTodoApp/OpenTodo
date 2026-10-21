## ADDED Requirements

### Requirement: Planning fields in proposals
The in-app assistant's fixed instructions SHALL explain the planning vocabulary (a do-on date, a deadline, a start date, Someday, This Evening, waiting for another task, a location) and when to use each, and its proposals MAY carry `deadline`, `start`, `evening`, `blocked_by` and `location` changes through the same registry tools as MCP. The review SHALL describe each such change in plain words with the old and new value where one existed ("Deadline 6 Nov", "Starts 3 Nov → 10 Nov", "Someday", "This evening", "Waits for “Order parts”", "No longer waits", "At Mum's", "Location removed"), in the user's date format, and apply the confirmed part through the operation log like every other change, undoable in one step. For an encrypted account the assistant stays unavailable as before.

#### Scenario: Deferral proposed and reviewed
- **WHEN** the user asks "push the report to next week but keep Friday as the deadline" and the assistant proposes `start: "2026-11-03"` and `deadline: "2026-11-06"` on that task
- **THEN** the review lists the task with the lines "Starts 3 Nov" and "Deadline 6 Nov", and applying it writes exactly those two operations on the device with the assistant's device id

#### Scenario: Waiting-for proposed
- **WHEN** the assistant proposes `blocked_by: ["<order-parts>"]` on "Install shelves"
- **THEN** the review line reads "Waits for “Order parts”", and after applying, "Install shelves" shows as blocked in the list

#### Scenario: Stale planning change
- **WHEN** the user changes a task's start date on another device between the proposal and the review
- **THEN** that line is marked as changed since the proposal, like a stale due date, and the user can still apply or skip it

### Requirement: Assistant reads respect project exclusions
The in-app assistant SHALL never see a project kept away from AI assistants (OpenSpec `agent-project-exclusion`): its read tools, its view context and its selected-task context SHALL leave such projects and their tasks out, a write tool naming one of their tasks SHALL fail as `not_found` during planning, and the assistant panel SHALL say "This project is kept away from assistants" instead of the composer's view hint while the user looks at one.

#### Scenario: Excluded project is invisible to the assistant
- **WHEN** the owner has kept "Client X" away from assistants and the user asks "what is due this week?"
- **THEN** the tasks of "Client X" appear nowhere in the assistant's reads or answer, and `list_projects` run by the assistant does not list it

#### Scenario: Selection inside an excluded project
- **WHEN** the user selects two tasks of "Client X" and opens the assistant with the "Break this down" skill
- **THEN** the selected ids are not passed to the model and the panel explains that the project is kept away from assistants
