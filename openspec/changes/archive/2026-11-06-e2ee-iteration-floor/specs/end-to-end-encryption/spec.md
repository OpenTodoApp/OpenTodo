## MODIFIED Requirements

### Requirement: Bounded key derivation parameters
A device SHALL accept a key record only with an integer PBKDF2 iteration count from 600,000, the count devices write, to 10,000,000: the same range the server stores. The `ot` CLI SHALL apply the same range to a record it reads. A record outside that range SHALL NOT be used or cached; a device without the key SHALL stay locked and show an error that names the problem. Key records are server data, not ops, so offline behaviour and convergence are unaffected: a device that already holds the key keeps working offline.

#### Scenario: Iteration count out of range
- **WHEN** the server serves a key record with 599,999 or 10,000,001 iterations
- **THEN** unlocking fails with the out-of-range error, the device stays locked and nothing is synced

#### Scenario: A record the app wrote
- **WHEN** the server serves a key record with 600,000 iterations
- **THEN** the device derives the key with that count and unlocks with the right passphrase

#### Scenario: The CLI reads a weak record
- **WHEN** `ot` reads a key record with 100,000 iterations
- **THEN** it refuses the record with the out-of-range error and decrypts nothing
