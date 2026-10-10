# Spec Delta

## MODIFIED Requirements

### Requirement: Delete a project
Deleting a project SHALL soft-delete it. Its tasks SHALL keep their project reference and stay hidden from every view except the Trash until the project is restored. Its direct sub-projects SHALL move to the deleted project's parent, or to the top level when it had none. No task or project is lost. Deletion works offline and converges on every device.

#### Scenario: Delete with open tasks
- **WHEN** the user confirms deletion of a project with three open tasks
- **THEN** the project and its tasks disappear from Inbox, Today, Upcoming, project views and counts, the project is listed in the Trash, and the three tasks are not shown in the Inbox

#### Scenario: Delete with sub-projects
- **WHEN** the user confirms deletion of a sub-project "Garden" (under "Home") that has sub-projects "Lawn" and "Beds"
- **THEN** "Garden" is listed in the Trash and "Lawn" and "Beds" appear under "Home"

#### Scenario: Restore brings the tasks back
- **WHEN** the user restores the project from the Trash
- **THEN** the project and its three open tasks are visible again exactly as before deletion
