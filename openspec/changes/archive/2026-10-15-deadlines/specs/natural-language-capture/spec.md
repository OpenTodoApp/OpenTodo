# Spec Delta

## ADDED Requirements

### Requirement: Deadline phrases
The parser SHALL recognise the word `deadline`, or its bundled equivalent in each active language, directly before a date phrase, and SHALL set the task's deadline to that date instead of its due date. The date SHALL resolve by the existing rules (today or later), a time after it SHALL stay in the title, and the deadline SHALL get its own chip. `on`, `by` and `due` SHALL keep setting the due date. Only the first deadline phrase in a line SHALL count.

#### Scenario: Deadline only
- **WHEN** today is Wednesday 2026-10-14 and the user enters `Send report deadline friday`
- **THEN** the task is titled `Send report`, has no due date and the deadline `2026-10-16`, and a deadline chip is shown

#### Scenario: Plan and deadline
- **WHEN** the user enters `Send report tomorrow deadline friday` on 2026-10-14
- **THEN** the task is due `2026-10-15` with the deadline `2026-10-16`

#### Scenario: German phrase
- **WHEN** German is active and the user enters `Bericht Frist 3. November`
- **THEN** the task is titled `Bericht` with the deadline `2026-11-03`

#### Scenario: Dismissed chip
- **WHEN** the user dismisses the deadline chip of `Review deadline policy tomorrow`
- **THEN** the title keeps `deadline policy` and the task is due tomorrow with no deadline
