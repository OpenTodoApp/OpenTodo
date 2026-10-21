## MODIFIED Requirements

### Requirement: Project icon
A project MAY carry an icon from the icon catalogue (`design-system` "Icon catalogue"), stored as an additive `icon` field on the project and changed as an ordinary project operation (applied locally first, converging by last-writer-wins). The project menu SHALL open the searchable icon picker, with "No icon" first. The sidebar, the page header and the project chip SHALL show the icon in the project's colour; without one, or with a name the device does not know, they show a coloured dot.

#### Scenario: Pick an icon offline
- **WHEN** the device is offline and the user picks the "briefcase" icon for "Work" from the project menu
- **THEN** the sidebar shows it at once, and other devices show it after sync

#### Scenario: Pick from the whole catalogue
- **WHEN** the user opens the icon picker of "Garden", types "plant" and picks the sprout icon
- **THEN** the project shows the sprout icon in the sidebar, the header and its chips, on this device at once and on other devices after sync

#### Scenario: Concurrent icon changes
- **WHEN** two devices set different icons for the same project while offline and both sync
- **THEN** every device shows the icon written with the greater timestamp

#### Scenario: Clients that know no icon
- **WHEN** an older client or the CLI reads a project with an icon
- **THEN** the field is ignored and the project renders with its dot as before
