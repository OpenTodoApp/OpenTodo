## MODIFIED Requirements

### Requirement: Comment entity
A comment SHALL belong to one task and SHALL have a markdown body, an author, an optional parent comment for threading, a creation time, an optional edit time, an optional deletion time, a list of mentioned accounts and, for a comment written by a guest through a task page (OpenSpec change `task-pages`), the guest's typed name and the page's id. The guest name is content and is encrypted like the body for an encrypted account; the author of a guest comment is the page's publisher. Comments SHALL be stored and synced as operations in the scope of their task, so they are created offline and converge by per-field last-writer-wins on every device of every member.

#### Scenario: Comment offline
- **WHEN** a member writes a comment on a shared task while offline and later reconnects
- **THEN** the comment appears immediately on their device, and on every other member's devices after their next sync, under the same task

#### Scenario: Comment on a personal task
- **WHEN** a user comments on a task in their Inbox
- **THEN** the comment syncs between their own devices and is visible to nobody else

#### Scenario: Invalid comment
- **WHEN** a device submits a comment whose body is not a string, exceeds 64 KB, or names a task that is not in a scope the author can read
- **THEN** the batch is refused as invalid or the operation is rejected, and nothing is stored

#### Scenario: Guest comment
- **WHEN** a guest named Marco replies through a task page
- **THEN** the comment carries `guest_name` "Marco", the page's `page_id` and the publisher as author, and every member's device shows it by "Marco (guest)"
