# Spec Delta

## ADDED Requirements

### Requirement: Calendar feeds for encrypted accounts
For an encrypted account the task feed SHALL serve every event with the placeholder summary and no description, labels or project name, keeping dates, times, durations and recurrence, so a calendar app shows when the user is busy but never ciphertext. Calendar subscriptions SHALL work unchanged; their events are fetched and stored by the server in plaintext, and the Settings panel SHALL say so.

#### Scenario: Feed of an encrypted account
- **WHEN** an encrypted account's feed is fetched
- **THEN** each `VEVENT` carries `SUMMARY:Encrypted item`, no `DESCRIPTION`, and the task's `DTSTART`, `DTEND` and `RRULE`

#### Scenario: Encryption turned on later
- **WHEN** a user with a working feed enables encryption
- **THEN** the next fetch of the feed shows placeholders and the panel explains why

#### Scenario: Subscription unchanged
- **WHEN** an encrypted account subscribes to a calendar URL
- **THEN** the events are fetched, stored on the server and drawn in the grid next to the decrypted tasks, and the panel notes that external events are not encrypted
