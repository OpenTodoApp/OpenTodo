# end-to-end-encryption Specification

## Purpose
Lets a user encrypt the content of their tasks and projects on their own devices so that the server, its backups and server-side integrations hold only ciphertext, while the existing field-level operation log and convergence rules carry that ciphertext unchanged.

## Requirements

### Requirement: Opt-in enablement with passphrase and recovery key
A signed-in user SHALL be able to enable encryption from Settings. The device SHALL generate a random account key, wrap it with a key derived from a passphrase of at least 12 characters and with a random recovery key shown once, and store only wrapped keys and derivation parameters through `PUT /api/v1/encryption/keys`. The server SHALL never receive the passphrase, account key or recovery key. Enablement needs the network; the key record is server-authoritative and versioned.

#### Scenario: Enable on one device
- **WHEN** the user chooses a passphrase, saves the recovery key and confirms the acknowledgement that lost keys mean lost content
- **THEN** the key record is stored, the profile reports `encryption.enabled: true`, and the device holds the unwrapped key locally

#### Scenario: Server holds only wrapped material
- **WHEN** the stored key record is inspected on the server
- **THEN** it contains wrapped keys, salts and derivation parameters only, from which the content cannot be decrypted without the passphrase or recovery key

#### Scenario: Anonymous or concurrent set-up
- **WHEN** a request without credentials calls any encryption route, or a second device tries to create a key record while one already exists
- **THEN** the response is a 401 `unauthorized` error for the anonymous request and a 409 `encryption_conflict` error for the second device, whose client then prompts for the existing passphrase instead

### Requirement: Encrypted and plaintext fields
For an encrypted account the device SHALL encrypt the user-written text of its personal scope (task title, description and calendar extras; project, label and section names; saved view names and queries; comment bodies) before it leaves the device. Scheduling, ordering and structure fields SHALL remain plaintext, and shared project scopes SHALL NOT be encrypted. The split SHALL be documented to users as the boundary of what is hidden.

#### Scenario: Plaintext fields
- **WHEN** an encrypted account changes `due`, `priority`, `completed_at`, `deleted_at`, `created_at`, `position`, `project_id`, `parent_id`, `section_id`, a task's `labels` id list, or a project's `color` or `archived`
- **THEN** the operations carry plaintext values

#### Scenario: Title is ciphertext, due date is not
- **WHEN** an encrypted account creates a task "Dentist" due tomorrow
- **THEN** the operations sent to the server carry a ciphertext string for `title` and the plaintext `{date}` object for `due`

#### Scenario: Label names encrypted, label assignments plaintext
- **WHEN** an encrypted account has labels `home` and `errand` and a task carries both
- **THEN** each label's `name` operation carries a ciphertext string and the task's `labels` operation carries the two label ids, so the server sees the count and the assignment but not the names

#### Scenario: Shared project stays plaintext
- **WHEN** an encrypted account edits a task in a project shared with other accounts
- **THEN** the operation carries the plaintext title, readable by every member

### Requirement: Transport through the unchanged operation log
Ciphertext SHALL be a string value beginning with a version prefix, carrying the nonce, the authenticated ciphertext and a binding to the entity, id and field it belongs to. The server SHALL validate, store and serve such operations exactly as any other string value; the operation schema, limits and sync endpoint SHALL NOT change. A value whose binding does not match where it is found SHALL be shown as undecryptable, never as another field's content.

#### Scenario: Server accepts ciphertext as an ordinary value
- **WHEN** an encrypted device syncs operations with ciphertext titles
- **THEN** the server applies them under the existing validation and the response reports them as applied

#### Scenario: Ciphertext too large
- **WHEN** a description's ciphertext exceeds the existing per-value limit
- **THEN** the sync request is refused with the existing 400 `invalid_op` error and the client shows which item is too long

#### Scenario: Ciphertext moved to another field
- **WHEN** a value encrypted for one task's `title` is presented under another task or field
- **THEN** the client renders an "undecryptable" placeholder for that field and keeps the operation

### Requirement: Convergence on ciphertext
Field-level last-writer-wins SHALL apply to ciphertext unchanged: for each field the operation with the greatest timestamp (ties by device id) wins on every device and on the server. Two ciphertexts of the same plaintext differ, and devices SHALL never compare values to decide a winner. Re-applying the same operation SHALL leave state unchanged.

#### Scenario: Concurrent edits of the same encrypted field
- **WHEN** two unlocked devices change the same title offline and both sync
- **THEN** every device decrypts and shows the title written with the greater timestamp, identical whichever device synced first

#### Scenario: Concurrent edits of an encrypted and a plaintext field
- **WHEN** device A changes a task's title while device B changes its due date, both offline, and both sync
- **THEN** both devices show the new title and the new due date

#### Scenario: Duplicate delivery
- **WHEN** an encrypted operation is delivered twice
- **THEN** the state after the second delivery equals the state after the first

### Requirement: Device enrolment, locking and offline use
A device that signs into an encrypted account without the key SHALL ask for the passphrase (or recovery key) before its first sync and SHALL keep the unwrapped key in browser storage in a non-exportable form. Operations are encrypted when created and decrypted when applied, so an unlocked device works fully offline, and queued offline edits are already ciphertext when uploaded. The user SHALL be able to lock a device, which discards the local key and pauses sync until unlocked.

#### Scenario: New device
- **WHEN** a user signs in on a new device and enters the correct passphrase
- **THEN** the device syncs, shows decrypted content, and later opens offline without asking again

#### Scenario: Wrong passphrase
- **WHEN** the entered passphrase cannot unwrap the key
- **THEN** the device shows an error without starting sync, and after 5 failures within a minute delays further attempts

#### Scenario: Offline edits on an unlocked device
- **WHEN** an unlocked device edits titles offline and later reconnects
- **THEN** the uploaded operations contain only ciphertext for content fields and other devices decrypt them

#### Scenario: Locked device receives operations
- **WHEN** a locked device regains the network
- **THEN** no operations are pulled or pushed until the device is unlocked, and the sync status reads "locked"

### Requirement: Passphrase change and recovery
The user SHALL be able to change the passphrase, which re-wraps the account key without re-encrypting content and updates the key record on the server, and to reset a forgotten passphrase with the recovery key, which also issues a new recovery key. Both actions require the network and a fresh re-authentication, and other devices SHALL keep working with their cached key. Losing both passphrase and recovery key SHALL be stated as unrecoverable; the server SHALL offer no reset.

#### Scenario: Change passphrase
- **WHEN** the user changes the passphrase on one device
- **THEN** a new device unlocks with the new passphrase, existing unlocked devices are unaffected, and no content operation is created

#### Scenario: Reset with recovery key
- **WHEN** the user enters the recovery key and a new passphrase
- **THEN** the key record is re-wrapped, a new recovery key is shown once, and the old recovery key no longer works

#### Scenario: Both lost
- **WHEN** the user has neither passphrase nor recovery key
- **THEN** Settings states that encrypted content cannot be recovered and offers only to disable encryption by deleting the key record and the encrypted content

### Requirement: Migration of existing data and history purge
Enabling encryption on an account with data SHALL re-write every content field as ciphertext through ordinary operations, with progress, resumable after interruption. Plaintext content later found by an unlocked device (for example written through the REST API) SHALL be encrypted by it on its next sync. `POST /api/v1/encryption/purge-history` SHALL delete the account's superseded plaintext content operations. Disabling SHALL decrypt and re-write content, then delete the key record.

#### Scenario: Enable on an account with existing tasks
- **WHEN** a user with 500 tasks enables encryption
- **THEN** 500 title operations plus description and label operations are created with new timestamps, progress is shown, and after sync the server holds ciphertext for every content field

#### Scenario: Plaintext written through the API
- **WHEN** a script creates a task with a plaintext title through the REST API and an unlocked device syncs
- **THEN** the device shows the task, re-writes the title as ciphertext, and the server's current value becomes ciphertext

#### Scenario: Purge history
- **WHEN** the user runs the purge after enabling
- **THEN** superseded operations of content fields are removed on the server, every device still converges on the current values, and a notice reminds the user that earlier backups may contain plaintext

#### Scenario: Purge errors
- **WHEN** a request without credentials, or an account without a key record, calls the purge route
- **THEN** the response is a 401 `unauthorized` error for the anonymous request and a 409 `encryption_disabled` error for the account without encryption

### Requirement: Consequences for server-side reads and integrations
For an encrypted account, REST collections and the export SHALL return ciphertext for content fields, and the export SHALL include the wrapped key record; plaintext REST writes are accepted and encrypted later. The profile SHALL expose `encryption: {enabled, keyVersion}`. Server-side integrations SHALL treat content fields as opaque and be disabled or limited where they need content; project sharing SHALL be refused for an encrypted account.

#### Scenario: REST read of an encrypted task
- **WHEN** a script requests a task of an encrypted account with a bearer token
- **THEN** the response contains the ciphertext string in `title` and the plaintext `due`, and the documentation explains the format

#### Scenario: Export includes keys and ciphertext
- **WHEN** an encrypted user downloads the export
- **THEN** the document contains ciphertext content, plaintext scheduling fields and the wrapped key record, enough to restore and decrypt with the passphrase elsewhere

#### Scenario: Sharing refused
- **WHEN** an encrypted account attempts to share a project
- **THEN** the request is refused with a 409 `encryption_enabled` error explaining that sharing is not yet available for encrypted accounts
