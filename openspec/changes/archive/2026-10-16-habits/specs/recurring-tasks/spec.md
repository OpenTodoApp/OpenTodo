# Spec Delta

## MODIFIED Requirements

### Requirement: End conditions
A rule MAY end on a date (`until YYYY-MM-DD`) or after a number of completed occurrences (`for N times`). When the computed next occurrence is after the end date, or the number of completed occurrences of the series has reached N, completing the task SHALL complete it like a non-recurring task. Skipped occurrences SHALL not count towards N, whether the skip left no record or, for a habit, a record marked `skipped`. The count SHALL be derived from the completed occurrence records so that it converges without a separate counter.

#### Scenario: Last occurrence
- **WHEN** a task with `every day until 2026-10-12` due 2026-10-12 is completed
- **THEN** the task gains a completion time and moves to Completed, and no further occurrence is scheduled

#### Scenario: Count reached on two devices
- **WHEN** two devices offline each complete the ninth occurrence of a `for 10 times` series, then sync
- **THEN** both show one ninth completion and the same tenth occurrence due, and the series ends after that tenth completion

#### Scenario: Skipped habit record does not count
- **WHEN** a habit with `every day for 2 times` is skipped on the first day and completed on the next two
- **THEN** the series ends with the second completion, on every device and when the completion comes through the API

### Requirement: Skip an occurrence
The user SHALL be able to skip the current occurrence from the detail panel and the keyboard. Skipping SHALL move the task to the next occurrence and SHALL be an ordinary due-date change, so it works offline and converges by last-writer-wins. For a task that is not a habit, skipping SHALL create no occurrence record. For a habit, skipping SHALL also write the occurrence record of the skipped date marked `skipped` (OpenSpec `habits`), with the derived record id, so concurrent skips converge to one record.

#### Scenario: Skip this week
- **WHEN** the user skips a task with `every monday` due 2026-10-12
- **THEN** its due date becomes 2026-10-19 and nothing is added to Completed

#### Scenario: Skip on two devices
- **WHEN** two devices skip the same occurrence offline and sync
- **THEN** every device shows the task due on the same next occurrence, not two steps ahead

#### Scenario: Skip a habit
- **WHEN** the user skips a habit with `every monday` due 2026-10-12
- **THEN** its due date becomes 2026-10-19, nothing is added to Completed, and the 12th shows as skipped in the habit's history
