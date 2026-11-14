## RENAMED Requirements

- FROM: `### Requirement: Reminders in the Trash`
- TO: `### Requirement: Reminders in the Trash and archived projects`

## MODIFIED Requirements

### Requirement: Reminders in the Trash and archived projects
A reminder SHALL not be delivered, in the app, by push, through a notification channel or by a native shell's device-scheduled notifications, while its task is deleted or while the task's project or any ancestor project is deleted or archived. Suppression SHALL not record delivery or dismissal, so after a restore or unarchiving a reminder fires at its time, and one whose time passed meanwhile is delivered once on the next check. Devices SHALL apply the rule from local data offline; it converges because it derives from synced deletion times and archived flags. The web app and the server SHALL apply the same rule, pinned by shared vectors.

#### Scenario: Task in a trashed project
- **WHEN** a reminder falls due on a task whose project is in the Trash
- **THEN** no push is sent, no in-app notification appears, and the reminder is not marked delivered

#### Scenario: Sub-project under a trashed ancestor
- **WHEN** concurrent offline edits leave a live sub-project under a deleted parent and a reminder on one of its tasks falls due
- **THEN** the reminder is not delivered

#### Scenario: Restored after the firing time
- **WHEN** the project is restored after a reminder's firing time passed while it was in the Trash
- **THEN** the reminder is delivered once on the next check and not again

#### Scenario: Deleted task
- **WHEN** a reminder falls due on a deleted task
- **THEN** it is not delivered until the task is restored

#### Scenario: Offline device
- **WHEN** a device without network holds a fired reminder on a task whose project it trashed locally
- **THEN** the in-app notification is not shown, and it appears again after the user restores the project

#### Scenario: Unfinished task in an archived project
- **WHEN** a reminder falls due on an open task whose project, or a project above it, is archived
- **THEN** no push is sent, no notification channel is sent a message, no in-app notification appears, a native shell is not handed the reminder, and the reminder is not marked delivered or dismissed

#### Scenario: Unarchived after the firing time
- **WHEN** the project is unarchived after a reminder's firing time passed while it was archived
- **THEN** the reminder is delivered once on the next check and not again, and a reminder whose time is still ahead fires on time
