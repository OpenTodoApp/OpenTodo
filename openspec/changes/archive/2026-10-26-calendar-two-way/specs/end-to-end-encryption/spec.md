# Spec Delta

## ADDED Requirements

### Requirement: Calendar sync for encrypted accounts
For an account with end-to-end encryption, calendar sync SHALL write events titled with the neutral placeholder "Encrypted item" and without notes, and SHALL never apply a title changed in the calendar; dates, times and lengths SHALL sync both ways as for other accounts. The Calendar sync panel SHALL say so.

#### Scenario: Encrypted task written
- **WHEN** an encrypted account's task is due tomorrow at 09:00
- **THEN** the event in the calendar is titled "Encrypted item" and has no description

#### Scenario: Title changed in the calendar
- **WHEN** the user renames that event in their calendar app
- **THEN** the task's title is unchanged, and moving the event still moves the task
