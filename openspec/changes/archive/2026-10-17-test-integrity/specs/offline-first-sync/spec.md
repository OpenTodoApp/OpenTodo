## ADDED Requirements

### Requirement: Convergence is verified under random histories
The test suite SHALL include a seeded property test of convergence: devices of more than one account with clocks from minutes slow to hours fast make random edits, exchange in random order and page sizes, and a project is shared part way through. After every device has exchanged its queued (offline) edits, every device SHALL hold the server's value and clock for each field it can see, and the server's state SHALL equal a last-writer-wins replay of its op log.

#### Scenario: Random history converges
- **WHEN** the property test runs with any seed
- **THEN** after the final exchanges every replica, the server and the replay of the op log agree on every field

#### Scenario: A failure can be replayed
- **WHEN** a run fails
- **THEN** its log names the seed, and running the test with that seed reproduces the same history

### Requirement: Op schema contract shared by server and client
One fixture file SHALL list, per entity, the op fields the server accepts, the field name prefixes, and the content fields an encrypted account encrypts. The server's test suite SHALL fail when its schema or content field list differs from the fixture, and the web client's test suite SHALL fail when its entities, row defaults or content field list differ from it, so a field cannot be added on one side only. Every content field SHALL be a schema field.

#### Scenario: Field added on the server only
- **WHEN** a field is added to the server schema but not to the fixture and the client's row defaults
- **THEN** the server's schema fixture test fails and names the difference

#### Scenario: Content field missing on the client
- **WHEN** a field is encrypted by the server's list but missing from the client's content fields
- **THEN** the client's schema fixture test fails
