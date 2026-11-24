## ADDED Requirements

### Requirement: Today summary is personal
`today_summary` SHALL leave out of `overdue`, `due_today`, `counts.overdue`, `counts.due_today` and the Today limit's slots a task assigned to an account other than the token's user (OpenSpec `task-assignment`, "Personal views hide tasks assigned to others"), on the server and in the on-device assistant alike; `counts.inbox` and `counts.per_project` SHALL count every open task as before. `list_tasks` and the view resources SHALL be unchanged and list every task. It SHALL write nothing and reflect only data devices have synced.

#### Scenario: Someone else's task due today
- **WHEN** a shared project holds a task due today assigned to the user, one assigned to no one and one assigned to another member, and an assistant calls `today_summary`
- **THEN** `due_today` lists the first two, `counts.due_today` is 2, and the project's `open` count is 3

