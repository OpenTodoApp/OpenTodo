## ADDED Requirements

### Requirement: Illustrations
The client SHALL draw illustrations for empty and finished states in one calm style: inline SVG line drawings built only from the design tokens (stroke in the muted text colour, at most one accent fill from the theme's accent at low opacity, the sunken surface as the only shape fill), round line caps and joins, one stroke width, no gradients, shadows, text, raster images or external files. Each illustration SHALL render correctly in light and dark themes and every colour theme by following the tokens, SHALL be decorative (hidden from assistive technology, the message is in the text beside it), SHALL fit a 160 by 120 px box, SHALL weigh at most 4 KB of markup, SHALL not animate when the user prefers reduced motion, and SHALL be shown as a story in the workbench in both themes. The empty-state pattern SHALL accept an illustration in place of its icon. The first illustration SHALL be Inbox zero: an empty tray with one small resting mark (a leaf or a check) beside it.

#### Scenario: Follows the theme
- **WHEN** the user switches from the light theme to the dark theme and to another colour theme while the Inbox zero state is shown
- **THEN** the illustration's strokes and fill change with the tokens, and no colour stays from the previous theme

#### Scenario: Not read by a screen reader
- **WHEN** a screen reader reaches the Inbox zero state
- **THEN** it reads the heading "Inbox zero: every task has a place." and the action, and nothing for the illustration

#### Scenario: Style gate
- **WHEN** a contributor adds an illustration that uses a hard-coded hex colour or a raster image
- **THEN** the UI lint fails and names the file
