# Spec Delta

## ADDED Requirements

### Requirement: Tracked time terms
`tracked` SHALL be a keyword matching tasks with at least one minute of live tracked time (every member's entries, a running entry to now). `tracked cmp duration` SHALL compare the task's tracked minutes with a duration (`30m`, `45min`, `1h`, `1h30`, `1.5h` or a bare number of minutes) using `<`, `<=`, `=`, `>=`, `>`. `tracked` SHALL be a reserved word. Evaluation SHALL stay on the device from local entries and follow synced ones.

#### Scenario: Any tracked time
- **WHEN** the user enters `tracked & #Work`
- **THEN** the open tasks of "Work" with at least one entry are listed, and `!tracked & #Work` lists the rest

#### Scenario: Over an hour
- **WHEN** a task has entries of 40 and 30 minutes and the user enters `tracked > 1h`
- **THEN** the task is listed, and it is not listed for `tracked <= 1h`

#### Scenario: Running entry counts live
- **WHEN** the user has tracked 55 minutes on a task whose entry is still running and the saved view `tracked >= 1h` is open
- **THEN** the task appears in the view within a minute without a reload

#### Scenario: Invalid duration
- **WHEN** the user enters `tracked > soon`
- **THEN** the error reads `Expected a duration such as 30m or 1h30 after ">" at position 11` and the same query is refused by the server when saved as a view

#### Scenario: Reserved word
- **WHEN** a project defines a field named "tracked" and the user enters `tracked > 10`
- **THEN** the term compares tracked time, and the field is reachable only as `"tracked" > 10`

#### Scenario: Offline and shared examples
- **WHEN** the device is offline and the user enters `tracked > 1h & due <= today`
- **THEN** the matching tasks are listed from local data, and every worked example of the documented grammar parses and evaluates identically on the device and on the server
