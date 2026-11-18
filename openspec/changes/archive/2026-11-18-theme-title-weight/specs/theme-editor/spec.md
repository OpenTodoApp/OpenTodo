## MODIFIED Requirements

### Requirement: Shape and type in the editor
The editor SHALL let the user choose the corner radius as a preset (Square, Default, Round) or as five values from 0 to 20 px, the font as OpenTodo's bundled typeface, the system, serif or monospace font, or an installed font by name, the list text size of 13, 14 or 15 px, and the weight of task titles (Regular, Semibold or Bold), all shown live in the preview. It SHALL say that an installed font is used only on devices that have it and is never downloaded.

#### Scenario: An installed font
- **WHEN** the user chooses Installed font and types "Atkinson Hyperlegible"
- **THEN** the preview uses that font where it is installed and the system font where it is not, and no font request leaves the device

#### Scenario: Bold task titles
- **WHEN** the user chooses Bold under Task titles
- **THEN** the preview's task titles are bold, the details beside them keep their weight, and the saved theme carries `"titleWeight": 700`
