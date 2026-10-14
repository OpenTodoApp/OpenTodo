# Spec Delta

## ADDED Requirements

### Requirement: Imported deadlines
A deadline in an imported file SHALL become the task's `deadline`, written as an operation like every imported field: the Todoist `DEADLINE` column, the Things to-do `deadline`, the generic JSON `deadline` key and a CSV `deadline` column (`YYYY-MM-DD`). A deadline with a time of day SHALL keep the date and drop the time with a row warning. The own export SHALL round-trip the field, and the preview SHALL count rows with a deadline.

#### Scenario: Todoist deadline
- **WHEN** a Todoist backup task has `DEADLINE` `21 Okt.` with deadline language `de`, exported in 2026
- **THEN** the task is imported with the deadline `2026-10-21` and no warning about it

#### Scenario: Things deadline
- **WHEN** a Things to-do has a start date of 2026-11-02 and a deadline of 2026-11-30
- **THEN** the task is due 2026-11-02 with the deadline `2026-11-30`, its description carries no "Deadline:" line and the row has no deadline warning

#### Scenario: Generic JSON with both keys
- **WHEN** a generic JSON item carries `"due": "2026-11-02"` and `"deadline": "2026-11-06T17:00:00Z"`
- **THEN** the task is due 2026-11-02 with the deadline `2026-11-06` and a warning that the deadline's time was dropped

#### Scenario: CSV column
- **WHEN** a CSV row has `deadline` `2026-11-06` and an empty `due_date`
- **THEN** the task has no due date and the deadline `2026-11-06`, and `deadline` is listed among the recognised columns

#### Scenario: Invalid deadline in a row
- **WHEN** a CSV row has `deadline` `next friday`
- **THEN** the row is reported as an error naming the value, and with `skip_rows` the other rows are still imported

#### Scenario: Own export round trip
- **WHEN** an export holding tasks with deadlines is imported into an empty account while a device of that account is offline
- **THEN** a fresh export lists the same deadlines, and the device receives them as ordinary operations on its next sync
