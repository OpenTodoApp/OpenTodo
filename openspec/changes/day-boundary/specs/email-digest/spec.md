# Spec Delta

## MODIFIED Requirements

### Requirement: Digest numbers match the statistics
The digest's numbers and lists SHALL follow the same definitions as `statistics`, including whose tasks count in shared projects, the exclusion of skipped habit occurrences and the user's day start (the day a completion counts for begins at the user's `day_start` in the digest's time zone, midnight when unset or invalid), pinned by a fixture that the device and the server both evaluate.

#### Scenario: Shared project tasks
- **WHEN** an overdue task lives in a shared project and is assigned to another member
- **THEN** it is not listed; tasks assigned to the user or unassigned in their projects are

#### Scenario: Same numbers as the screen
- **WHEN** the shared fixture is evaluated by the device and by the server
- **THEN** both produce the same completed, created, late and slipped counts

#### Scenario: Night owl's week
- **WHEN** a user with a day start of `04:00` completed a task at 01:30 on the Monday that starts a new week, and the digest for the previous week is built
- **THEN** the completion counts in the previous week, as the Statistics screen shows it, and the fixture holds this case

#### Scenario: No day start stored
- **WHEN** the user's preferences row has no `day_start` or an invalid one
- **THEN** the digest counts days from midnight in the digest's time zone, as before
