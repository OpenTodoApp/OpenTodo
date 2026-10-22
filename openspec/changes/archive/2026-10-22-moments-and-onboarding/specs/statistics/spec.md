# Spec Delta

## MODIFIED Requirements

### Requirement: Excluded rows
Tasks in the Trash SHALL be excluded from every statistic, a habit's skipped occurrence SHALL NOT count anywhere, because it is not a completion, and tasks marked `sample` (the start guide's sample tasks), open or completed, SHALL be excluded from every statistic, so trying the app never changes a week's numbers. The same exclusions SHALL apply wherever the statistics' definitions are reused (the Loop pulse, the weekly digest), through one shared predicate pinned by the shared fixture, so every device and the server agree.

#### Scenario: Trashed task excluded
- **WHEN** a task completed on Monday is moved to the Trash on Tuesday
- **THEN** it no longer counts as completed for that week, and counts again if restored

#### Scenario: Skipped habit occurrence
- **WHEN** a habit was done on four days of the week and skipped on a fifth
- **THEN** completed counts four for that week and the skipped day is in no number

#### Scenario: Sample task excluded
- **WHEN** a new user completes two of the three sample tasks and one real task in their first week
- **THEN** Done reads 1 for that week, the created count does not include the samples, and the shared fixture holds this case
