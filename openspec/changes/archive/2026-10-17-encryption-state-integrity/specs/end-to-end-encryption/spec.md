## ADDED Requirements

### Requirement: Encryption is turned off only on the device
A device on which the account encrypts SHALL turn encryption off only through an explicit action of its user. When the server answers that it has no key record, the device SHALL keep encrypting and its key, stop syncing (state Locked) and upload nothing, including the re-send after a server restore, until the user decides.

#### Scenario: Key record missing on refresh
- **WHEN** an unlocked device that encrypts asks for the key record and the server answers 404
- **THEN** encryption stays on, the device shows the record-missing screen, sync reads Locked and no operation is uploaded

#### Scenario: Server restored from a backup made before encryption
- **WHEN** the server is restored to a backup without a key record and the device sees the new log generation
- **THEN** the device does not re-send its data and uploads no plaintext content; after the user restores the key record, the re-send goes out as ciphertext

#### Scenario: Turning encryption off explicitly
- **WHEN** the user turns encryption off in Settings, or on the record-missing screen after another device turned it off
- **THEN** encryption is off on this device and content is uploaded in plaintext again

### Requirement: Record-missing choices
While the server has no key record, the device SHALL show a screen that offers to restore the key record from this device (a device without the key enters its passphrase first), to turn encryption off on this device, or to sign out. Restoring SHALL upload the cached record as a new record wrapping the same account key, so the passphrase and recovery key stay valid.

#### Scenario: Restoring the key record
- **WHEN** the user chooses to restore the key record on a device that holds the key
- **THEN** the server stores the device's copy of the record, sync resumes, and another device unlocks with the same passphrase

#### Scenario: Restoring without the key
- **WHEN** a device without the key enters its passphrase on the record-missing screen
- **THEN** the passphrase is checked against the device's copy of the record and, if correct, the record is restored and the device is unlocked

### Requirement: Bounded key derivation parameters
A device SHALL accept a key record only with an integer PBKDF2 iteration count from 100,000 to 10,000,000. A record outside that range SHALL NOT be used or cached; a device without the key SHALL stay locked and show an error that names the problem.

#### Scenario: Iteration count out of range
- **WHEN** the server serves a key record with 99,999 or 10,000,001 iterations
- **THEN** unlocking fails with the out-of-range error, the device stays locked and nothing is synced

### Requirement: Ciphertext rollback is a documented limit
The threat model in the documentation SHALL state that a ciphertext is bound to its entity, id and field but not to a version, so a server can serve an older ciphertext of the same field again without the device detecting it.

#### Scenario: Reading the threat model
- **WHEN** a user reads the end-to-end encryption page's threat model
- **THEN** it lists rollback of a field to an older ciphertext among the things encryption does not protect against
