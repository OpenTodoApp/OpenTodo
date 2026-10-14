# Spec Delta

## MODIFIED Requirements

### Requirement: Encrypted and plaintext fields
For an encrypted account the device SHALL encrypt the user-written text of its personal scope (task title, description and calendar extras; project names, descriptions and notes; label and section names; saved view names and queries; comment bodies) before it leaves the device. Scheduling, ordering and structure fields SHALL remain plaintext, and shared project scopes SHALL NOT be encrypted. The split SHALL be documented to users as the boundary of what is hidden.

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

#### Scenario: Project note is ciphertext
- **WHEN** an encrypted account writes a note on one of its own projects
- **THEN** the `description` and `notes_doc` operations carry ciphertext strings, the `notes_doc` ciphertext fits the document size limit, and the project's `position` stays plaintext
