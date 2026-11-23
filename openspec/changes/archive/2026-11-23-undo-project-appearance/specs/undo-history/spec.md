## ADDED Requirements

### Requirement: A project's name, colour and icon are steps
Renaming a project, choosing its colour or choosing its icon, from the project's menus, the sidebar, its header or the command palette, SHALL record one step in the undo history. A rename SHALL be named "Renamed “{from}” → “{to}”" with both names, a colour "Colour {name}" with the colour's name, and an icon "Project updated". None SHALL show the Undo toast. Undoing the step SHALL restore the previous value, and redoing it SHALL apply the change again. Choosing the value a project already has SHALL record nothing. The change SHALL be written locally first, offline too, as an ordinary op that converges through sync.

#### Scenario: Undo a project rename
- **WHEN** a person renames the project "Work" to "Studio" and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the project is called "Work" again

#### Scenario: The same colour
- **WHEN** a person picks the colour a project already has
- **THEN** no step is added
