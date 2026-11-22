## MODIFIED Requirements

### Requirement: Sub-projects through the parent reference
A project whose parent is unset SHALL be a top-level project; a project whose parent is set SHALL be a sub-project of that parent, to any depth. A new project SHALL start at the top level and SHALL be nested only when the user chooses a parent in the create form; the project on screen SHALL NOT be taken as its parent. The parent reference SHALL be stored and synced as the existing `parent_id` field, so edits made offline are applied locally at once and converge under per-field last-writer-wins.

#### Scenario: Create a sub-project
- **WHEN** the user chooses a parent in the create form
- **THEN** the new project appears nested under that parent in the sidebar, with the parent expanded so it is visible

#### Scenario: New projects in a row
- **WHEN** the user creates a project from the sidebar while another project is on screen, and then another one right after
- **THEN** both new projects are top-level

#### Scenario: Parent referencing a missing project
- **WHEN** a project's parent refers to a project this device has not received, or that is deleted
- **THEN** the project is shown at the top level until the parent arrives or is restored, and no data is changed
