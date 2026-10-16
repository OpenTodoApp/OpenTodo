# Spec Delta

## MODIFIED Requirements

### Requirement: Project fields
A project SHALL have a name, a colour, a sort position, an archived flag, an optional parent project, creation time, optional deletion time, and a note held as a Markdown `description` with its mergeable `notes_doc` document (see `project-notes`). A project whose parent is unset SHALL be a top-level project; a project whose parent is set SHALL be a sub-project of that parent, to any depth. The parent reference SHALL be stored and synced as the existing `parent_id` field, so edits made offline are applied locally at once and converge under per-field last-writer-wins.

#### Scenario: Create a project
- **WHEN** the user creates a project with a name
- **THEN** it appears in the sidebar immediately as a top-level project with an assigned colour and an empty note, and opens as the current view

#### Scenario: Create a sub-project
- **WHEN** the user creates a project from within an existing project's view or chooses a parent in the create form
- **THEN** the new project appears nested under that parent in the sidebar, with the parent expanded so it is visible

#### Scenario: Parent referencing a missing project
- **WHEN** a project's parent refers to a project this device has not received, or that is deleted
- **THEN** the project is shown at the top level until the parent arrives or is restored, and no data is changed

#### Scenario: Project synced before the note existed
- **WHEN** a device holds a project row received before the note fields existed
- **THEN** the project reads as having an empty note, and no operation is written until someone edits it
