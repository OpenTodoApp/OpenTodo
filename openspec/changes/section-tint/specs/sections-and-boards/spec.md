## MODIFIED Requirements

### Requirement: Section colour and icon
The section menu, in the list heading and on the board column, SHALL offer "Colour" with the project palette and "No colour", and "Icon" with the searchable icon picker and "No icon". A section's icon SHALL be shown immediately before its title, in the list heading and the board column header, drawn in the section's colour when it has one and in the heading's text colour otherwise. A section's colour without an icon SHALL be shown as a small dot of that colour before the title. A section with a colour SHALL also tint its header with a soft fill of that colour: the group bar in the list, and the header strip at the top of its board column; the section's rows and cards SHALL NOT be tinted, and every text tone of the header SHALL keep at least 4.5:1 contrast on the tint in light and dark, in high contrast and with every shipped theme. A section with neither SHALL look as it does today. Colour and icon SHALL never replace the title or the open-task count, and SHALL add no row of chrome. The "No section" group SHALL never carry a colour, an icon or a tint, and groupings other than by section SHALL show no tint. Editing works offline and converges like any section edit; viewers of a shared project see the style but cannot change it.

#### Scenario: Style a section offline
- **WHEN** the device is offline and the user picks the hourglass icon and the amber colour for "Waiting" from its heading menu
- **THEN** the heading shows an amber hourglass before "Waiting" on an amber-tinted bar at once, the board column shows the same, and other devices show it after sync

#### Scenario: Colour without icon
- **WHEN** a section has the green colour and no icon
- **THEN** its heading and column header show a small green dot before the title, on a soft green tint

#### Scenario: Only the header is tinted
- **WHEN** a green section with three tasks is shown in the list and on the board
- **THEN** its group bar and its column header strip are tinted green, and its task rows and cards keep their usual surface

#### Scenario: Contrast on the tint
- **WHEN** the contrast gate measures the header's label, count and action tones on every hue's tint
- **THEN** each meets 4.5:1 in light, dark, high contrast and every shipped and swept theme

#### Scenario: Default look
- **WHEN** the user creates a new section "Backlog"
- **THEN** its heading shows the title and count only, on the plain bar, as before this change

#### Scenario: Keyboard
- **WHEN** a keyboard user opens the heading menu of "Doing", chooses "Icon", types "rocket" and presses Enter
- **THEN** the rocket icon is set and focus returns to the heading menu's trigger

#### Scenario: Viewer of a shared project
- **WHEN** a viewer opens the heading menu of a section in a shared project
- **THEN** the menu offers no Colour or Icon item, and the section's style is shown as the owner set it
