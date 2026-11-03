## ADDED Requirements

### Requirement: A first copy leaves out superseded note history
A device that copies an account for the first time (its pull starts from the beginning of the log, also after a restore's re-seed, and continues until the server reports nothing more) SHALL ask the server to leave out note history it never needs, and the server SHALL then leave out, per sharing scope and note field: every note document for which the same device wrote a later document of the same field, and every note projection (`description`) and pending-append value that is not the field's current winner. Everything else SHALL be served as before, every left-out operation SHALL be passed by the device's cursor like the device's own operations, and the byte budget of a page SHALL count only what is served. The server SHALL decide only from each operation's timestamp and device, never from its value, so it works the same on end-to-end encrypted accounts, where values stay ciphertext. Because a device's note document only grows (each save merges what the device holds), the latest document of each device holds everything that device wrote, so the new device SHALL end with the same notes, rows and winners as a device that pulled the whole log, and every device SHALL converge as before. A device that does not ask (an older client, a device that already holds the account) SHALL receive the log exactly as before. Offline, nothing changes: the device pulls nothing and keeps its changes queued.

#### Scenario: New device after a year of notes
- **WHEN** a new device signs in to an account whose 500 notes were each saved 300 times by one device
- **THEN** it receives one document and one projection per note, every other field in full, and shows the same notes as the device that wrote them

#### Scenario: Concurrent edits not merged yet
- **WHEN** devices A and B each saved a note several times without pulling the other's saves, and a new device C signs in before either syncs again
- **THEN** C receives A's latest document and B's latest document of that note, merges them, publishes the union, and ends with both edits like a device that pulled every save

#### Scenario: Older client
- **WHEN** a client that does not send the request pulls from the beginning
- **THEN** it receives every operation of the log, as before this change

#### Scenario: Encrypted account
- **WHEN** a new device of an end-to-end encrypted account makes its first copy
- **THEN** the server leaves out the same superseded note history by timestamp and device alone, and every value it serves is the stored ciphertext

#### Scenario: Interrupted first copy
- **WHEN** the first copy stops halfway (the app is closed or the network drops) and resumes later
- **THEN** the device keeps asking for the latest documents until the server reports nothing more, and asks no more after that
