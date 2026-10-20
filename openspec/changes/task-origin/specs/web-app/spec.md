# Spec Delta

## MODIFIED Requirements

### Requirement: Task panel property chips
The property chips SHALL be a wrapping row of chips for the properties that have a value, with Do on and Priority always present, followed by an Add control listing the remaining properties with their shortcuts. A chip SHALL read as its value and open its editor on click or Enter; Escape or a committed edit closes the editor with focus back on the chip. A task with an origin SHALL show an Origin chip reading as the row's origin chip does (kind icon, external id or host, the stored title as its tooltip); click or Enter SHALL open its URL in a new tab when it has one, and the chip SHALL offer Remove, which clears the origin as one offline-capable write. Origin SHALL not be listed in the Add control.

#### Scenario: Values read as values
- **WHEN** the user opens a task due tomorrow at 09:00 with priority 2 in "Work"
- **THEN** the breadcrumb reads "Work", the chips read "Tomorrow 09:00" and "P2", and no input box is visible

#### Scenario: Add a property
- **WHEN** the user opens the Add control and picks Estimate
- **THEN** an Estimate chip appears with its editor open and focused, and leaves again if the editor closes without a value

#### Scenario: Edit a row with the keyboard
- **WHEN** the user tabs to the Do on chip and presses Enter
- **THEN** the When control opens with focus in it, and Escape closes it with focus back on the chip

#### Scenario: Open the source from the panel
- **WHEN** the user opens a task captured from `https://example.org/post` and presses Enter on the Origin chip
- **THEN** the page opens in a new tab and the panel stays as it was

#### Scenario: Remove the origin offline
- **WHEN** the device is offline and the user removes the Origin chip
- **THEN** the chip disappears at once, the task's notes still hold the URL the capture wrote, and the removal syncs when the network returns

#### Scenario: No origin, no chip
- **WHEN** the user opens a task without an origin and opens the Add control
- **THEN** no Origin chip is shown and Origin is not offered
