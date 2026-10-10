# Spec Delta

## MODIFIED Requirements

### Requirement: Delete a project
Deleting a project SHALL soft-delete it. Its tasks SHALL keep their project reference and SHALL be hidden from every view except the Trash while the project is deleted, so that restoring the project brings them back and no task is lost. Deletion works offline and converges on every device through the operation log.

#### Scenario: Delete with open tasks
- **WHEN** the user confirms deletion of a project with three open tasks
- **THEN** the project and its tasks disappear from Inbox, Today, Upcoming, project views and counts, the project is listed in the Trash, and the three tasks are not shown in the Inbox

#### Scenario: Restore brings the tasks back
- **WHEN** the user restores the project from the Trash
- **THEN** the project and its three open tasks are visible again exactly as before deletion
