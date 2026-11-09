# Spec Delta

## ADDED Requirements

### Requirement: Follow-up suggestions
The in-app assistant SHALL be offered `suggest_followups` with 1 to 3 suggestions of at most 60 characters, at most once per answer and not in an answer that asked a choice. They SHALL show as buttons under the latest answer only; activating one SHALL send its text as the next message, through the same path and limits as typing. Offline they are disabled. They do not count toward the block limit.

#### Scenario: Tap a suggestion
- **WHEN** an answer listed three overdue tasks and suggested "Move them to Friday"
- **THEN** activating the suggestion sends "Move them to Friday" as the next message

#### Scenario: Older suggestions
- **WHEN** a later message exists
- **THEN** the earlier answer shows no active suggestions
