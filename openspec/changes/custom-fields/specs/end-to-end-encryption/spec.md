# Spec Delta

## MODIFIED Requirements

### Requirement: Encrypted and plaintext fields
For an encrypted account the device SHALL encrypt the user-written text of its personal scope (task title, description, calendar extras; project, label, section names; view names and queries; comment bodies; attachment names, types, links; custom field names, options and string values) and its attachment files before they leave the device. Structure fields and number and checkbox values SHALL stay plaintext; shared projects SHALL NOT be encrypted. The split SHALL be documented.

#### Scenario: Plaintext fields
- **WHEN** an encrypted account changes `due`, `priority`, `completed_at`, `deleted_at`, `created_at`, `position`, `project_id`, `parent_id`, `section_id`, a task's `labels` id list, a number or checkbox custom field value, or a project's `color` or `archived`
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

#### Scenario: Custom field name and values
- **WHEN** an encrypted account defines a choice field "Client" with options "Acme" and "Globex" and sets a task's Client to "Acme" and its Cost to 120
- **THEN** the field's `name` and `options` operations and the task's Client value carry ciphertext, the Cost value carries the plaintext number 120, and the API and assistant tools show the string values as the encrypted placeholder

#### Scenario: Attachment in the personal scope
- **WHEN** an encrypted account attaches `receipt.pdf` to a task in its Inbox
- **THEN** the `name`, `mime` and `url` operations carry ciphertext, `size`, `sha256` and `encrypted: true` are plaintext, the uploaded bytes are a chunked authenticated ciphertext bound to the attachment id, and the server serves them as opaque bytes

#### Scenario: Attachment in a shared project
- **WHEN** an encrypted account attaches a file to a task of a project another account shares with it
- **THEN** the metadata and the bytes are plaintext, readable by every member

#### Scenario: Attachment opened on another device
- **WHEN** an unlocked device of the account downloads the encrypted attachment
- **THEN** it decrypts chunk by chunk with the account key, verifies every chunk, and shows the file; a chunk that fails authentication makes the whole file "undecryptable" and nothing partial is shown
