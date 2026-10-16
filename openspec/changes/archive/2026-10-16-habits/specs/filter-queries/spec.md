# Spec Delta

## MODIFIED Requirements

### Requirement: Priority, state and search terms
`p1` to `p4` SHALL match the task priority. `completed` SHALL include completed tasks and `open` only open ones; a query without either SHALL match open tasks only. A skipped occurrence record of a habit (OpenSpec `habits`) SHALL match neither. `habit` SHALL match tasks flagged as habits. `subtask` SHALL match tasks that have a parent. `search: text` SHALL match tasks whose title or description contains the text ignoring case, with quotes allowed for several words. Deleted tasks SHALL never match any query.

#### Scenario: Default to open tasks
- **WHEN** the user enters `p1`
- **THEN** only open priority-1 tasks are listed, and `p1 & completed` lists only completed ones

#### Scenario: Text search
- **WHEN** the user enters `search: "oat milk"`
- **THEN** tasks whose title or description contains "oat milk" in any letter case are listed

#### Scenario: Habits
- **WHEN** the user enters `habit & due <= today`
- **THEN** the open habits due today or overdue are listed, evaluated on the device like every query

#### Scenario: Skipped records never match
- **WHEN** a habit was skipped yesterday and the user enters `completed`
- **THEN** yesterday's skipped record is not listed, while a day the habit was done is
