# Spec Delta

## ADDED Requirements

### Requirement: Today summary reports the Today limit
`today_summary` SHALL return `today_limit` (`null` when off, else the number of slots) and SHALL mark each listed task due today or overdue with `waiting_for_slot` (true when the user's Today limit keeps it waiting, false otherwise), computed with the same fill rule as the web app (OpenSpec `today-closed-list`) from the rows devices have synced. It SHALL write nothing. `list_tasks` with `view: "today"` SHALL be unchanged and list every task.

#### Scenario: Limit on
- **WHEN** the user's limit is 3, Today has five available tasks and an assistant calls `today_summary`
- **THEN** the result carries `today_limit: 3`, three tasks with `waiting_for_slot: false` and two with `waiting_for_slot: true`

#### Scenario: Limit off
- **WHEN** the user has no limit
- **THEN** the result carries `today_limit: null` and every task has `waiting_for_slot: false`
