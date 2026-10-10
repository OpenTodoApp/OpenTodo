# Spec Delta

## MODIFIED Requirements

### Requirement: Soft delete
Deleting a task SHALL set a deletion time rather than removing data. Deleted tasks SHALL be hidden from all views except the Trash and from list endpoints, SHALL remain in the export, SHALL stay deleted on every device after sync, and SHALL be restorable from the Trash until purged.

#### Scenario: Delete syncs as a tombstone
- **WHEN** a task is deleted on one device while another device edits its title offline
- **THEN** after both devices sync, the task is deleted on both and the title edit does not resurrect it

#### Scenario: Deleted task is only visible in the Trash
- **WHEN** a task is deleted
- **THEN** it is absent from Inbox, Today, Upcoming, Completed, project and filter views and present in the Trash
