# Spec Delta

## ADDED Requirements

### Requirement: Project view blocks
The in-app assistant SHALL be offered `show_board` (a project, optionally one column), `show_timeline` (a project), `show_activity` (a project or task, at most 20 events), `show_stats` (a date range), `show_task` (a task) and `show_habit` (a habit task), each checked like the other display tools and rendered read-only with the app's own view from local rows, live and offline.

#### Scenario: Board column
- **WHEN** the model shows the "In progress" column of Website launch
- **THEN** the block shows that column's cards as on the board, and activating a card opens its task

#### Scenario: Habit streak
- **WHEN** the model shows the habit "Run" with a 5-day streak
- **THEN** the block shows the habit grid and "5 days"

### Requirement: Display tools offered by relevance
When a turn's display tools would exceed the provider's strict-tool limit, the assistant SHALL offer the six original display tools plus those a skill lists or the turn's view suggests (a project view suggests board and timeline; Today suggests stats). Every offered set SHALL be the same on the server and the device.

#### Scenario: Project view
- **WHEN** the user asks from a project's board view
- **THEN** the turn offers `show_board` and `show_timeline` with the original display tools
