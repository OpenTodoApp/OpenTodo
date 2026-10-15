# Spec Delta

## ADDED Requirements

### Requirement: Deadline follows the series
When a series moves to its next occurrence (by completion, skip or detaching), a deadline on the series SHALL move by the same number of calendar days as the due date moved. The completed occurrence record and a detached copy SHALL keep the deadline of the occurrence they were made from. The shift SHALL be a function of the old and new due dates computed on the device, so devices that complete the same occurrence offline converge on the same deadline.

#### Scenario: Weekly report
- **WHEN** a task with `every monday` due 2026-10-12 and the deadline 2026-10-14 is completed
- **THEN** the series is due 2026-10-19 with the deadline 2026-10-21, and the completed record keeps the deadline 2026-10-14

#### Scenario: Catch-up keeps the distance
- **WHEN** a task with `every day` due 2026-10-09 and the deadline 2026-10-10 is completed on 2026-10-14
- **THEN** the series is due 2026-10-15 with the deadline 2026-10-16

#### Scenario: Two devices complete offline
- **WHEN** two devices complete the same occurrence of a series with a deadline while offline, then sync
- **THEN** every device shows one completed record and the same next due date and deadline

#### Scenario: Series without a deadline
- **WHEN** a series without a deadline is completed
- **THEN** no deadline operation is written and the series still has none
