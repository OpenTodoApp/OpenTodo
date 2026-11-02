## ADDED Requirements

### Requirement: Re-write job covers every content kind
The re-write job that runs when encryption is turned on or off SHALL re-write the content fields of every entity kind that has content fields in the operation schema, including notes, time entries, routines, calendar frames and slots, saved locations, objectives and the review record, not only tasks, projects, labels, sections, saved views, custom fields, comments and attachments. A kind added to the schema with content fields SHALL fail the client's tests until the job covers it. A note SHALL be personal only when its project is, and a time entry only when its task is, both at upload and in the job; the job SHALL NOT re-write a time entry or comment of another person. The job works offline on local rows and uploads through the operation log; its values converge by per-field last-writer-wins.

#### Scenario: Enable with existing notes, time entries and places
- **WHEN** a user with a standalone note, a time entry note, a saved location, a routine, a frame, a slot and a line for tomorrow turns encryption on
- **THEN** after the next sync the server's current value of each of their content fields is ciphertext, and the device still shows the plaintext

#### Scenario: Disable
- **WHEN** the same user turns encryption off
- **THEN** after the next sync the server's current value of each of those fields is plaintext again

#### Scenario: Shared project
- **WHEN** an encrypted account has a note and a time entry in a project shared with other accounts
- **THEN** neither is encrypted, at upload or by the job, and the members read them

#### Scenario: New content kind
- **WHEN** a developer adds an entity with a content field to the schema without adding it to the job
- **THEN** the client's unit tests fail and name the missing kind

### Requirement: Catch-up after the job gains kinds
A device SHALL remember which entity kinds its last complete run of the re-write job covered. When the account encrypts, the device is unlocked, the key record is present, no job is stored, and the remembered list lacks a kind the job now covers (or the device never ran the job), the device SHALL run the encrypt job once at the end of its next exchange that pulled every operation and emptied its outbox, and upload the result. It SHALL skip every value the server already holds as ciphertext, write back as plaintext any ciphertext of a shared project, and record the current list when the run completes, so a further exchange writes nothing. A device that holds the key of an account that no longer encrypts SHALL run the decrypt job the same way. A locked device SHALL wait until it is unlocked; an offline device until its next complete exchange.

#### Scenario: Account that turned encryption on with the older job
- **WHEN** an account turned encryption on with a release whose job missed time entries, and a device of the account is updated and unlocked
- **THEN** at the end of its next complete sync the device re-writes the time entry notes the server holds in plaintext, uploads them as ciphertext, writes nothing for tasks already encrypted, and a further sync writes nothing

#### Scenario: Two devices updated at once
- **WHEN** two unlocked devices of the account run the catch-up concurrently
- **THEN** both re-write the same plaintext, the server's current value of each field is ciphertext that decrypts to the same text on both devices, and neither runs the catch-up again

#### Scenario: Locked device
- **WHEN** the updated device is locked
- **THEN** nothing is re-written or uploaded until the user unlocks it, and then the catch-up runs after the next complete sync

#### Scenario: Account that never encrypted
- **WHEN** a device of an account that never turned encryption on syncs
- **THEN** the catch-up writes nothing
