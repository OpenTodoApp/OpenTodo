## MODIFIED Requirements

### Requirement: Section entity
A section SHALL have a name, the id of the project it belongs to, a sort position, creation time and optional deletion time. It MAY also carry a colour from the palette and an icon from the icon catalogue (`design-system` "Icon catalogue"), both empty for a new section, and an optional aisle key (OpenSpec `reusable-lists`), one of `produce`, `bakery`, `dairy`, `meat`, `frozen`, `pantry`, `drinks`, `household` or `personal`, empty for a new section unless it was created as an aisle section; a value outside that list SHALL read as empty on clients and SHALL be refused by the REST API with 400 `invalid_aisle`. Sections SHALL be created, edited and deleted as operations in the log, applied locally first so they work offline, and SHALL converge under per-field last-writer-wins like tasks and projects. A section's project reference SHALL not change after creation. A client that does not know the colour, icon or aisle fields SHALL ignore them and keep showing the section as before.

#### Scenario: Create a section offline
- **WHEN** the device is offline and the user adds a section "Doing" to a project
- **THEN** the section appears immediately in that project, survives a reload, and reaches other devices after the network returns

#### Scenario: Concurrent rename
- **WHEN** two devices rename the same section offline and both sync
- **THEN** every device shows the name written with the greater timestamp

#### Scenario: Colour and rename at the same time
- **WHEN** one device renames "Doing" to "In progress" while another, offline, gives "Doing" the blue colour, and both sync
- **THEN** every device shows a blue section named "In progress"

#### Scenario: Older client
- **WHEN** a client released before section colours reads a section with a colour and an icon
- **THEN** it shows the section with its name only and writes nothing to those fields

#### Scenario: Renamed aisle section keeps its key
- **WHEN** one device renames the aisle section "Dairy and eggs" to "Fridge" while another adds the new item "Butter" to the same reusable list offline, and both sync
- **THEN** Butter is in "Fridge" on every device, because the section's aisle key is unchanged
