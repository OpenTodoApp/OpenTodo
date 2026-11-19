## ADDED Requirements

### Requirement: Task title weight in the editor
The editor's Shape and type section SHALL offer **Task title weight** after the list text size, with the choices Regular, Medium, Semibold and Bold, labelled and reachable with the keyboard like the section's other controls. A choice SHALL show in the preview at once; Regular SHALL remove the key from the document. The choice SHALL be saved with the theme, offline included, and SHALL sync and converge as the theme's other values do.

#### Scenario: Choose semibold
- **WHEN** the user chooses Semibold in a theme of their own
- **THEN** the preview's task titles are semibold at once, and after Save the theme carries `"titleWeight": 600` on all their devices

#### Scenario: Back to regular
- **WHEN** the user chooses Regular
- **THEN** the theme no longer carries `titleWeight`

#### Scenario: Offline
- **WHEN** the device is offline and the user changes the weight and saves
- **THEN** the theme applies at once and reaches the other devices when the device is back online
