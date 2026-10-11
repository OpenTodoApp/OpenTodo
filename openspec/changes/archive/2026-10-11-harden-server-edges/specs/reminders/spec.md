# Spec Delta

## ADDED Requirements

### Requirement: Reminders in the Trash
A reminder SHALL not be delivered, by push or in the app, while its task is deleted or while the task's project or any ancestor project is deleted. Suppression SHALL not record delivery or dismissal, so after a restore a reminder fires at its time, and one whose time passed meanwhile is delivered once on the next check. Devices SHALL apply the rule from local data offline; it converges because it derives from synced deletion times.

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
