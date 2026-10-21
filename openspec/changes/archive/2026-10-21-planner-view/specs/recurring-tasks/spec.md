# Spec Delta

## MODIFIED Requirements

### Requirement: Recurring tasks in views
Today, Upcoming and project views SHALL show a recurring task once, at its current occurrence, with a repeat indicator and the rule visible in the detail panel. Completed SHALL list each completed occurrence as its own entry. The detail panel SHALL show a preview of the next three occurrences, computed locally, and SHALL make the rule, skip and detach controls reachable with the keyboard. The calendar's Plan mode (OpenSpec `planner-view`) SHALL additionally draw the occurrences that would follow the current one, dimmed and read-only, computed on the device from the rule and never written; every other view shows only the current occurrence.

#### Scenario: One row per series
- **WHEN** Upcoming is opened with a task due tomorrow that repeats daily
- **THEN** the task appears under Tomorrow only, with the repeat indicator

#### Scenario: Preview updates offline
- **WHEN** the device is offline and the user changes the rule in the detail panel
- **THEN** the next-three preview updates immediately

#### Scenario: Projected in the plan only
- **WHEN** a task with `every monday` due next Monday is viewed in Upcoming, the Month and the Plan
- **THEN** Upcoming and the Month list it on next Monday only, and the Plan lists it on next Monday as a row and on the Mondays after as dimmed projections that cannot be moved and write nothing
