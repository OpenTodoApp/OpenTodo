# Spec Delta

## Purpose

Defines projects as the containers tasks live in, the Inbox as the default container, and the views that organise tasks by project.

## ADDED Requirements

### Requirement: Project fields
A project SHALL have a name, a colour, a sort position, an archived flag, an optional parent (reserved for hierarchy), creation time and optional deletion time.

#### Scenario: Create a project
- **WHEN** the user creates a project with a name
- **THEN** it appears in the sidebar immediately with an assigned colour and opens as the current view

### Requirement: Inbox is the default container
A task without a project SHALL belong to the Inbox. The Inbox SHALL always exist and SHALL not be deletable or renamable.

#### Scenario: Task without project
- **WHEN** a task is created outside any project view or its project is cleared
- **THEN** it is listed in the Inbox

### Requirement: Rename and recolour
The user SHALL be able to rename a project and choose its colour from a palette.

#### Scenario: Rename
- **WHEN** the user edits the project title and confirms
- **THEN** the new name is shown everywhere the project is referenced, including task rows in other views

### Requirement: Archive a project
Archiving SHALL hide a project from the sidebar without deleting it or its tasks. Its tasks SHALL keep their project reference.

#### Scenario: Archive
- **WHEN** the user archives a project
- **THEN** the project leaves the sidebar, the view returns to the Inbox, and the project's tasks are no longer shown in open views

### Requirement: Delete a project
Deleting a project SHALL soft-delete it and move its open tasks to the Inbox so no task is lost.

#### Scenario: Delete with open tasks
- **WHEN** the user confirms deletion of a project with three open tasks
- **THEN** the project is hidden and the three tasks are listed in the Inbox

### Requirement: Open task counts
The sidebar SHALL show the number of open tasks for the Inbox, for Today and for each project.

#### Scenario: Counts update live
- **WHEN** a task in a project is completed
- **THEN** that project's count decreases without a page reload
