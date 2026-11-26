# Spec Delta

## ADDED Requirements

### Requirement: Phone section add controls
Below 768 px, the plus control on a project's section heading and both the header and footer Add task controls of a project board column SHALL open the shared phone quick-add sheet instead of an inline section field. They SHALL supply the originating project and section, including No section. They SHALL remain restricted to people who can edit tasks, and a Completed column SHALL offer no add action. From 768 px the existing inline section add SHALL remain unchanged. Task creation SHALL use the same offline operations and converge through sync with the same project and section.

#### Scenario: List section with either phone preference
- **WHEN** an editor activates a section's plus below 768 px, with New phone screens on or off
- **THEN** the shared sheet opens for that section and no inline section input appears

#### Scenario: Board footer
- **WHEN** an editor activates Add a task at the bottom of a phone project-board column
- **THEN** the shared sheet opens for that column's section

#### Scenario: Read-only project
- **WHEN** a viewer opens a project list or board on a phone
- **THEN** no editable section or column add action is offered

#### Scenario: Desktop section
- **WHEN** an editor activates a section's plus at 1280 px
- **THEN** the existing inline section field opens without the phone sheet
