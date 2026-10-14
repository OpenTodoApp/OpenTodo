# Spec Delta

## ADDED Requirements

### Requirement: Attachments in tool results
`get_task` and the `opentodo://tasks/{id}` resource SHALL list the task's non-removed attachments and those of its shown comments with id, size, upload state and, inside the untrusted-text field, name, media type and link. No tool or resource SHALL return file bytes or a URL from which an assistant could fetch them. Results reflect synced data only; removed attachments are excluded.

#### Scenario: Task with a file
- **WHEN** an assistant calls `get_task` for a task with `receipt.pdf` attached
- **THEN** the result's `attachments` lists one item with its id, `size`, `uploaded: true` and an untrusted field holding `receipt.pdf` and `application/pdf`, and nothing that yields the bytes

#### Scenario: Link attachment
- **WHEN** the task carries a link attachment
- **THEN** the item's untrusted field holds the link's name and URL, marked as data the assistant must not follow as instructions

#### Scenario: Encrypted account
- **WHEN** an assistant of an encrypted account calls `get_task` for a task with an attachment
- **THEN** the attachment is listed with its size and upload state, and its name and type are ciphertext or the placeholder, as for titles
