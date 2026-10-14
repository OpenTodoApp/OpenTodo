# Spec Delta

## MODIFIED Requirements

### Requirement: Encrypted and plaintext fields
For an encrypted account the device SHALL encrypt the user-written text of its personal scope (task title, description and calendar extras; project, label and section names; saved view names and queries; comment bodies; attachment names, media types and links) and the bytes of every attachment file in that scope before they leave the device. Scheduling, ordering and structure fields SHALL remain plaintext, and shared project scopes SHALL NOT be encrypted. The split SHALL be documented to users as the boundary of what is hidden.

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

#### Scenario: Attachment in the personal scope
- **WHEN** an encrypted account attaches `receipt.pdf` to a task in its Inbox
- **THEN** the `name`, `mime` and `url` operations carry ciphertext, `size`, `sha256` and `encrypted: true` are plaintext, the uploaded bytes are a chunked authenticated ciphertext bound to the attachment id, and the server serves them as opaque bytes

#### Scenario: Attachment in a shared project
- **WHEN** an encrypted account attaches a file to a task of a project another account shares with it
- **THEN** the metadata and the bytes are plaintext, readable by every member

#### Scenario: Attachment opened on another device
- **WHEN** an unlocked device of the account downloads the encrypted attachment
- **THEN** it decrypts chunk by chunk with the account key, verifies every chunk, and shows the file; a chunk that fails authentication makes the whole file "undecryptable" and nothing partial is shown

### Requirement: Migration of existing data and history purge
Enabling encryption on an account with data SHALL re-write every content field as ciphertext through ordinary operations, with progress, resumable after interruption, and SHALL re-upload every file attachment of the personal scope as an encrypted file (a new attachment replacing the old one, which is removed), which needs the network. Plaintext content later found by an unlocked device (for example written through the REST API) SHALL be encrypted by it on its next sync. `POST /api/v1/encryption/purge-history` SHALL delete the account's superseded plaintext content operations. Disabling SHALL decrypt and re-write content, re-upload files decrypted, then delete the key record.

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
