## MODIFIED Requirements

### Requirement: Today summary reports the Today limit
`today_summary` SHALL return `today_limit` (`null` when off, else the number of slots) and SHALL mark each listed task due today or overdue with `waiting_for_slot` (true when the user's Today limit keeps it waiting, false otherwise), computed with the same fill rule as the web app (OpenSpec `today-closed-list`) from the rows devices have synced. Each waiting task SHALL also carry `time_sensitive` (true when it is due today with a time or its deadline is today), and the result SHALL carry `waiting_time_sensitive`, the ids of those tasks soonest first (OpenSpec `today-waiting-time-sensitive`); the slots SHALL not change because of a time. It SHALL write nothing. `list_tasks` with `view: "today"` SHALL be unchanged and list every task.

#### Scenario: Limit on
- **WHEN** the user's limit is 3, Today has five available tasks and an assistant calls `today_summary`
- **THEN** the result carries `today_limit: 3`, three tasks with `waiting_for_slot: false` and two with `waiting_for_slot: true`

#### Scenario: Time-sensitive waiting tasks
- **WHEN** the limit is 1 and the waiting tasks include one due today at 16:00, one at 09:00 and one with a deadline today
- **THEN** those three carry `time_sensitive: true`, the other waiting tasks `time_sensitive: false`, and `waiting_time_sensitive` lists the 09:00 task, the 16:00 task, then the deadline

#### Scenario: Limit off
- **WHEN** the user has no limit
- **THEN** the result carries `today_limit: null` and every task has `waiting_for_slot: false`
