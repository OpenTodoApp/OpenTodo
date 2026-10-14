# Spec Delta

## ADDED Requirements

### Requirement: Start date and evening on a series
When a series moves to its next occurrence (by completion, skip or detaching), a start date on the series SHALL move by the same number of calendar days as the due date moved, and the evening flag SHALL stay on the series. The completed occurrence record and a detached copy SHALL keep the start and evening values of the occurrence they were made from. The shift SHALL be a function of the old and new due dates computed on the device, so devices that complete the same occurrence offline converge.

#### Scenario: Weekly task hidden until its day
- **WHEN** a task with `every monday` due 2026-10-19 and the start `2026-10-17` is completed on 2026-10-19
- **THEN** the series is due 2026-10-26 with the start `2026-10-24`, so it is deferred again until the Saturday before

#### Scenario: Evening routine
- **WHEN** a task with `every day` due today and the evening flag is completed
- **THEN** the series is due tomorrow with the evening flag still set, and the completed record carries the flag

#### Scenario: Parking ends the series
- **WHEN** the user parks a recurring task in Someday
- **THEN** its due date and rule are cleared in one batch, as clearing the due date does, and no next occurrence is scheduled
