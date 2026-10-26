## ADDED Requirements

### Requirement: An entity id names one entity on the server
The ids of projects, tasks, sections, custom fields, comments, attachments, time entries and automation rules SHALL be unique on the server. An operation for an id that exists SHALL be applied in the scope where the entity lives, with the author's permission checked there. An operation for an id that exists only in a scope the author cannot see SHALL be refused with reason `forbidden`, like any write the author may not make: nothing is created, no server value is handed back, and the rest of the batch is applied. A batch whose `project_id` places a stored task, section or custom field in another scope SHALL have every operation for that entity refused with reason `scope_change`. Labels, saved views, reminders, places, reviews and preferences stay per account. These rules are checked when an operation is received, for every write path (sync, REST, CalDAV, import, AI agent tools, calendar and issue sync, email, automation rules), so offline devices converge: the refused operations are dropped from the outbox and the entity stays unchanged for everyone.

Where data written by an earlier version holds one id in several scopes, the entity SHALL belong to the copy with the earliest operation among the scopes the reader can see, for reads and writes alike, and a write to a younger copy SHALL be refused when an older copy the author cannot see is in a scope that shares a member with it. Purging one copy SHALL not remove reminders that an account keeps on its own copy. Copies in scopes without a common member keep working for their owners.

#### Scenario: Private task id reused in a shared project
- **WHEN** bob, who shares a project with alice, learns the id of alice's private Inbox task and submits operations creating a task with that id in the shared project
- **THEN** the operations are refused with reason `forbidden` and no server value, alice's task is unchanged, her later edits stay in her personal scope, bob's devices never receive it, and bob cannot purge it

#### Scenario: Every kind of entity
- **WHEN** bob submits a project, section, custom field, comment, attachment, time entry or automation rule whose id is one of alice's private entities
- **THEN** each is refused with reason `forbidden` and alice's entity stays only in her personal scope

#### Scenario: Labels stay per account
- **WHEN** bob creates a label whose id is the id of one of alice's labels
- **THEN** both accounts keep their own label

#### Scenario: Derived id created first
- **WHEN** bob creates a task in the shared project with the id alice's device will use for the next occurrence record of her private recurring task, and alice's device then submits that record in her Inbox
- **THEN** every operation of the record is refused with reason `scope_change` and bob's task receives none of alice's fields

#### Scenario: Copy left by an earlier version
- **WHEN** the database holds alice's private task and a copy with the same id that bob created in their shared project before the upgrade
- **THEN** alice is shown and edits her own task, her edits stay in her personal scope, bob's writes to the copy are refused, and a purge of bob's copy keeps alice's reminders

#### Scenario: Two accounts imported the same file
- **WHEN** two accounts that share no project hold the same task id from importing the same export before the upgrade
- **THEN** each keeps editing their own copy
