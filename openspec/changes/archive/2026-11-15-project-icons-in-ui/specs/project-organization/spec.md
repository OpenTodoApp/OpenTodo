## ADDED Requirements

### Requirement: Project marks across the signed-in app

Where a project picker displays a colour dot next to a project name, it SHALL display the configured icon in the project colour when available, including any marked selected value. Archived Projects, Notes rows, Monthly Look, Project Walk, Loop, the Activity Feed, Trash and Quick Add SHALL use the same rule at their existing project marks. The mark SHALL be decorative and SHALL use the local project fields, including offline. As project fields sync to other devices, each device SHALL show the resulting icon if its catalogue can render it. These views SHALL keep the coloured dot for an absent, unknown or unavailable icon.

#### Scenario: A known icon identifies the same project across views

- **WHEN** a project with a known icon appears in a project picker, archive, note row or review screen
- **THEN** the mark uses the configured icon and the project colour, with the project name available as before

#### Scenario: A device cannot render the project icon

- **WHEN** a project has no icon, its icon name is unknown, or its icon is not yet available on the device
- **THEN** the mark shows the project colour dot without changing project data

#### Scenario: An option does not refer to a project

- **WHEN** a picker offers No project, Top level or another choice that does not refer to a project
- **THEN** the option retains its existing symbol and selection behaviour
