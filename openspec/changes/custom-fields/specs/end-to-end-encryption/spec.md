# Spec Delta

## MODIFIED Requirements

### Requirement: Encrypted and plaintext fields
For an encrypted account the device SHALL encrypt the user-written text of its personal scope (task title, description and calendar extras; project, label and section names; saved view names and queries; comment bodies; custom field names and choice options; and every string custom field value, that is text, link, date and choice values) before it leaves the device. Scheduling, ordering and structure fields, and number and checkbox custom field values, SHALL remain plaintext, and shared project scopes SHALL NOT be encrypted. The split SHALL be documented to users as the boundary of what is hidden.

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
