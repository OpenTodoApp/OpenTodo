## MODIFIED Requirements

### Requirement: Registry drives the guide and the palette
The keyboard guide in the documentation and the shortcut column of the command palette SHALL be generated from the registry, grouped by section, so the three never disagree. The guide SHALL render keys with the same keycap rules as the cheat sheet (one keycap per chord, "then" and "or" between them, no wrapping inside a keycap), and the palette SHALL render a command's keys as keycaps at the right of its row with the same "then" between the steps of a sequence. The keys that work only inside the palette's Add mode (Shift+Enter to add and open, `↓` and `↑` to move over the field rows, Tab to edit the highlighted row) SHALL be registry entries local to the palette, listed in the cheat sheet and the guide.

#### Scenario: New shortcut
- **WHEN** a change adds a registry entry for "Toggle density" with `Shift+D`
- **THEN** the cheat sheet, the regenerated keyboard guide and the palette's "Toggle density" command all show `Shift+D` without further edits

#### Scenario: Guide keycaps
- **WHEN** the user opens Help → Keyboard shortcuts on a phone
- **THEN** `g then t` reads as two keycaps and no keycap is split across lines

#### Scenario: Palette keycaps
- **WHEN** the user types "today" in the command palette
- **THEN** "Go to Today" shows the keycaps `G` then `T` at the right of its row

#### Scenario: Add mode keys are listed
- **WHEN** the user opens the cheat sheet and searches for "add and open"
- **THEN** a row lists `Shift+Enter` for adding the task from the command bar's Add mode and opening it
