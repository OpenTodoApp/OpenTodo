## MODIFIED Requirements

### Requirement: Deadlines in Today
Today SHALL list, besides tasks due today or earlier, every open task whose deadline is today or earlier. A task whose deadline has passed and that is not due today SHALL join the Earlier group; a task whose deadline is today SHALL join today's group. The sidebar's Today count SHALL count the same tasks. A task SHALL appear once even when both its due date and its deadline qualify.

#### Scenario: Deadline today without a due date
- **WHEN** today is 2026-10-14 and an open task has no due date and the deadline `2026-10-14`
- **THEN** it is listed in Today's group with the `Today` countdown, and the Today count includes it

#### Scenario: Scheduled later than a past deadline
- **WHEN** today is 2026-10-14 and a task is due 2026-10-16 with the deadline 2026-10-13
- **THEN** it is listed once, in Today's Earlier group, with `1d over`

#### Scenario: Deadline still ahead
- **WHEN** a task is due 2026-10-20 with the deadline 2026-10-24 and today is 2026-10-14
- **THEN** it is not in Today
