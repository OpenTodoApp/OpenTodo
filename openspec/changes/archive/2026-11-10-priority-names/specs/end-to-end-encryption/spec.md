## ADDED Requirements

### Requirement: Encrypted priority names
For an encrypted account the device SHALL encrypt the four priority names of its preferences like other user-written text, while every task's `priority` stays plaintext. Turning encryption on SHALL re-write existing names as ciphertext, and purging history SHALL remove superseded plaintext names. A locked device SHALL show the default names until it is unlocked.

#### Scenario: Name is ciphertext, priority is not
- **WHEN** an encrypted account names level 1 "Must" and sets a task to priority 1
- **THEN** the `priority_name_1` operation carries a ciphertext string and the task's `priority` operation the plaintext number 1

#### Scenario: Turning encryption on
- **WHEN** an account with the level name "Must" turns encryption on and the re-write job finishes
- **THEN** the stored name is ciphertext and the plaintext value is gone from the history after the purge

#### Scenario: Locked device
- **WHEN** a device of an encrypted account is locked
- **THEN** priorities read "Priority 1" to "Priority 4" and show the real names after unlocking
