## MODIFIED Requirements

### Requirement: Section entity
A section SHALL have a name, the id of the project it belongs to, a sort position, creation time and optional deletion time. It MAY also carry a colour from the palette and an icon from the icon catalogue (`design-system` "Icon catalogue"), both empty for a new section. Sections SHALL be created, edited and deleted as operations in the log, applied locally first so they work offline, and SHALL converge under per-field last-writer-wins like tasks and projects. A section's project reference SHALL not change after creation. A client that does not know the colour or icon fields SHALL ignore them and keep showing the section as before.

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

### Requirement: Sections API
The API SHALL expose a `sections` collection under `/api/v1/sections` with list, get, create, patch and delete, following the collection conventions: authentication required, soft delete, write-through to the operation log, unknown fields rejected. Create SHALL require a name and an existing, non-deleted `project_id`. Create and patch SHALL accept an optional `color` (a `#rrggbb` hex string, or null to clear it) and an optional `icon` (a catalogue name, or null to clear it), and list and get SHALL return both, null when unset. Tasks SHALL accept `section_id` in create and patch.

#### Scenario: Create a section via the API
- **WHEN** a script POSTs `{"name":"Doing","project_id":"<project>"}` to `/api/v1/sections` with a bearer token
- **THEN** the response is 201 with the section including `id`, `position`, `created_at`, and `color` and `icon` both null, and devices receive it on their next sync

#### Scenario: Style a section via the API
- **WHEN** a script PATCHes `{"color":"#3b82f6","icon":"hourglass"}` to a section with a bearer token
- **THEN** the response is 200 with both values, and devices show the section blue with the hourglass after sync

#### Scenario: Unknown icon or malformed colour
- **WHEN** a create or patch body has `icon` set to a name that is not in the catalogue, or `color` that is not `#rrggbb`
- **THEN** the response is 400 with code `invalid_input` naming the field, and nothing is written

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials lists or creates sections
- **THEN** the response is 401 `unauthorized`

#### Scenario: Invalid project
- **WHEN** a create body names a `project_id` that does not exist or is deleted
- **THEN** the response is 400 with code `invalid_input` and no section is created

## ADDED Requirements

### Requirement: Section colour and icon
The section menu, in the list heading and on the board column, SHALL offer "Colour" with the project palette and "No colour", and "Icon" with the searchable icon picker and "No icon". A section's icon SHALL be shown immediately before its title, in the list heading and the board column header, drawn in the section's colour when it has one and in the heading's text colour otherwise. A section's colour without an icon SHALL be shown as a small dot of that colour before the title. A section with neither SHALL look as it does today. Colour and icon SHALL never replace the title or the open-task count, and SHALL add no row of chrome. The "No section" group SHALL never carry a colour or an icon. Editing works offline and converges like any section edit; viewers of a shared project see the style but cannot change it.

#### Scenario: Style a section offline
- **WHEN** the device is offline and the user picks the hourglass icon and the amber colour for "Waiting" from its heading menu
- **THEN** the heading shows an amber hourglass before "Waiting" at once, the board column shows the same, and other devices show it after sync

#### Scenario: Colour without icon
- **WHEN** a section has the green colour and no icon
- **THEN** its heading and column header show a small green dot before the title

#### Scenario: Default look
- **WHEN** the user creates a new section "Backlog"
- **THEN** its heading shows the title and count only, as before this change

#### Scenario: Keyboard
- **WHEN** a keyboard user opens the heading menu of "Doing", chooses "Icon", types "rocket" and presses Enter
- **THEN** the rocket icon is set and focus returns to the heading menu's trigger

#### Scenario: Viewer of a shared project
- **WHEN** a viewer opens the heading menu of a section in a shared project
- **THEN** the menu offers no Colour or Icon item, and the section's style is shown as the owner set it
