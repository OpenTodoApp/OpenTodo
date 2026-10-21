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
For an encrypted account the device SHALL encrypt the user-written text of its personal scope (task title, description and calendar extras; project names, descriptions and notes; label and section names; saved view names and queries; comment bodies; attachment names, types and links) and the bytes of its attachment files before they leave the device. A task's `origin` SHALL be encrypted as one whole value (the object serialised, then encrypted into one ciphertext string), because its `title`, `url` and `id` name the page, mail or issue; the server accepts that string wherever it accepts the object. Scheduling, ordering and structure fields SHALL stay plaintext; shared projects SHALL NOT be encrypted. The split SHALL be documented.

#### Scenario: Plaintext fields
- **WHEN** an encrypted account changes `due`, `priority`, `completed_at`, `deleted_at`, `created_at`, `position`, `project_id`, `parent_id`, `section_id`, a task's `labels` id list, or a project's `color` or `archived`
- **THEN** the operations carry plaintext values

#### Scenario: Title is ciphertext, due date is not
- **WHEN** an encrypted account creates a task "Dentist" due tomorrow
- **THEN** the operations sent to the server carry a ciphertext string for `title` and the plaintext `{date}` object for `due`

#### Scenario: Origin is one ciphertext
- **WHEN** an encrypted account captures `https://example.org/post` from the share sheet
- **THEN** the `origin` operation carries one ciphertext string, the server stores and serves it unchanged, another unlocked device shows the chip with the host and opens the page, and `origin: url` matches on both devices

#### Scenario: Label names encrypted, label assignments plaintext
- **WHEN** an encrypted account has labels `home` and `errand` and a task carries both
- **THEN** each label's `name` operation carries a ciphertext string and the task's `labels` operation carries the two label ids, so the server sees the count and the assignment but not the names

#### Scenario: Shared project stays plaintext
- **WHEN** an encrypted account edits a task in a project shared with other accounts
- **THEN** the operation carries the plaintext title, readable by every member

#### Scenario: Project note is ciphertext
- **WHEN** an encrypted account writes a note on one of its own projects
- **THEN** the `description` and `notes_doc` operations carry ciphertext strings, the `notes_doc` ciphertext fits the document size limit, and the project's `position` stays plaintext

#### Scenario: Attachment in the personal scope
- **WHEN** an encrypted account attaches `receipt.pdf` to a task in its Inbox
- **THEN** the `name`, `mime` and `url` operations carry ciphertext, `size`, `sha256` and `encrypted: true` are plaintext, the uploaded bytes are a chunked authenticated ciphertext bound to the attachment id, and the server serves them as opaque bytes

#### Scenario: Attachment in a shared project
- **WHEN** an encrypted account attaches a file to a task of a project another account shares with it
- **THEN** the metadata and the bytes are plaintext, readable by every member

#### Scenario: Attachment opened on another device
- **WHEN** an unlocked device of the account downloads the encrypted attachment
- **THEN** it decrypts chunk by chunk with the account key, verifies every chunk, and shows the file; a chunk that fails authentication makes the whole file "undecryptable" and nothing partial is shown

### Requirement: Encrypted custom fields
For an encrypted account the device SHALL also encrypt, in its personal scope, custom field names and choice options and every string value of a custom field (text, link, date and choice), like other user-written text (OpenSpec `custom-fields`). Number and checkbox values SHALL stay plaintext, like `priority`.

#### Scenario: Custom field name and values
- **WHEN** an encrypted account defines a choice field "Client" with options "Acme" and "Globex" and sets a task's Client to "Acme" and its Cost to 120
- **THEN** the field's `name` and `options` operations and the task's Client value carry ciphertext, the Cost value carries the plaintext number 120, and the API and assistant tools show the string values as the encrypted placeholder

#### Scenario: Number and checkbox values stay plaintext
- **WHEN** an encrypted account sets a task's number field to 120 and its checkbox field to on
- **THEN** the two value operations carry the plaintext number 120 and `true`

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
Enabling encryption SHALL re-write every content field as ciphertext through ordinary operations, with progress, resumable, and re-upload each personal file as an encrypted attachment replacing the old one. Plaintext later found by an unlocked device SHALL be encrypted on its next sync. `POST /api/v1/encryption/purge-history` SHALL delete superseded plaintext content operations. Disabling SHALL re-upload files decrypted, delete the key record, then re-write content.

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

#### Scenario: Enable with existing attachments
- **WHEN** a user with 40 attached files enables encryption
- **THEN** the migration downloads, encrypts and re-uploads each file as a new encrypted attachment, removes the plaintext one, shows "n of 40 files", resumes where it stopped after an interruption, and a device that syncs meanwhile sees each task's attachment change once

#### Scenario: Disable with encrypted attachments
- **WHEN** the user disables encryption
- **THEN** every encrypted file is re-uploaded decrypted and the key record is deleted only after the last file is confirmed, so no attachment becomes unreadable

#### Scenario: Migration offline
- **WHEN** the device loses the network during the file re-upload
- **THEN** the content operations already queued stay queued, the files not yet re-uploaded keep their old form, and the job continues when the network returns

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

### Requirement: Encrypted projects cannot be published
An account with encryption on SHALL NOT create a public link for a project it has not shared (409 `encryption_enabled`), because the server holds only ciphertext for it. A public link of an unshared project whose creator enables encryption later SHALL answer 404 `link_invalid` from then on, so ciphertext never reaches a guest. Links on shared projects, which are plaintext, are unaffected.

#### Scenario: Creation refused
- **WHEN** an encrypted account creates a public link for an unshared project
- **THEN** the response is 409 `encryption_enabled` and no link exists

#### Scenario: Encryption enabled after publishing
- **WHEN** the owner of a published, unshared project enables encryption and a guest reloads the page
- **THEN** the response is 404 `link_invalid` and the page says the link no longer works

#### Scenario: Shared project
- **WHEN** an encrypted account that is an admin of a shared project creates a public link for it
- **THEN** the link works and serves the plaintext titles every member sees

### Requirement: Re-write job reads incrementally

The re-write job that runs when encryption is turned on or off SHALL read each batch from where the previous batch stopped, in primary-key order, so the rows it reads grow linearly with the size of the store. Progress and resumption are unchanged: an interrupted job resumes after the last re-written row, also after going offline, and the re-written values converge through the operation log as before.

#### Scenario: Turning encryption on with many tasks

- **WHEN** encryption is turned on with 2,000 tasks (ten batches)
- **THEN** each task is read a fixed few times during the job, not once per batch

#### Scenario: Interrupted job resumes

- **WHEN** the job stops after one batch and runs again
- **THEN** it continues after the last re-written row and every row is re-written exactly once

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

### Requirement: Link attachments follow the encryption mode
Turning encryption on SHALL move the account's personal link attachments to ciphertext, and turning it off SHALL move them back to plaintext. Since the server fixes a link's address at creation, each link SHALL be replaced in one batch by a copy in the new form while the old one moves to the Trash. This SHALL work offline, upload on the next sync and never replace a link twice; links in shared projects SHALL stay unchanged.

#### Scenario: Enable with an existing link
- **WHEN** a personal task has a link attachment and the user turns encryption on
- **THEN** after the next sync the server holds one live link for the task whose address and name are ciphertext, the plaintext link is in the Trash, and the device shows the same address and name

#### Scenario: Disable with an encrypted link
- **WHEN** the user turns encryption off on an account with an encrypted personal link
- **THEN** after the next sync the server holds one live link for the task whose address and name are plaintext

#### Scenario: Nothing left to migrate
- **WHEN** the migration has run and is started again
- **THEN** no link is replaced again
