## MODIFIED Requirements

### Requirement: Illustrations
The client SHALL draw illustrations for empty and finished states in one calm style: inline SVG line drawings built only from the design tokens, with round line caps and joins and no gradients, shadows, text, raster images or external files.
- **Stroke weights:** two, a main line for the object and a fine detail line, with strokes in the muted text colour.
- **Fills:** the surface as the object fill and the sunken surface for ground shapes. At most one accent shape, filled with the theme's accent at low opacity and outlined in the accent text colour.
- **Motif:** every illustration SHALL sit inside the brand mark's open loop, drawn in the fine line with its opening at the upper right, and its accent shape SHALL sit in or leave through that opening.

Each illustration SHALL render correctly in light and dark themes and every colour theme by following the tokens, SHALL be decorative (hidden from assistive technology, the message is in the text beside it), SHALL fit a 160 by 120 px box, SHALL weigh at most 4 KB of markup, SHALL not animate when the user prefers reduced motion, and SHALL be shown as a story in the workbench in both themes. The empty-state pattern SHALL accept an illustration in place of its icon. The first illustration SHALL be Inbox zero: an empty tray with a paper plane leaving through the loop's opening.

#### Scenario: Follows the theme
- **WHEN** the user switches from the light theme to the dark theme and to another colour theme while the Inbox zero state is shown
- **THEN** the illustration's strokes and fill change with the tokens, and no colour stays from the previous theme

#### Scenario: Not read by a screen reader
- **WHEN** a screen reader reaches the Inbox zero state
- **THEN** it reads the heading "Inbox zero: every task has a place." and the action, and nothing for the illustration

#### Scenario: Style gate
- **WHEN** a contributor adds an illustration that uses a hard-coded hex colour or a raster image
- **THEN** the UI lint fails and names the file

#### Scenario: Weights and fills gate
- **WHEN** a contributor draws a line with a third stroke width, fills a shape with the canvas colour, or fills two shapes with the accent
- **THEN** the UI lint fails naming the file and the line

#### Scenario: Objects stand out in the dark theme
- **WHEN** an empty state is shown in the dark theme
- **THEN** the drawing's object is lighter than the canvas behind it, and the accent shape's outline is the bright accent

### Requirement: Illustration set
The client SHALL provide, in the illustration style, these named illustrations, each inside the open loop with its accent in the opening:

| Name | Object | Accent |
| --- | --- | --- |
| `inbox-zero` | an empty tray | a paper plane |
| `today-clear` | a mug with steam | the sun |
| `week-clear` | a desk calendar with seven open days | a kite |
| `project-new` | an open box with a sprout | the sprout's leaf |
| `day-done` | a closed notebook lying flat with its ribbon | a crescent moon |
| `trash-empty` | a bin with its lid on | a drifting leaf |

The empty Today, the empty Upcoming, a project with no open task, Done for today and the empty Trash SHALL show the matching one above their sentence. Each SHALL follow every rule of "Illustrations": tokens only, two stroke weights, one accent shape, 160 by 120 px, at most 4 KB, decorative, light and dark, every colour theme, and no animation under reduced motion. Each SHALL have a story in the workbench in both themes. A view SHALL name an illustration from this set only; naming an unknown one SHALL fail the type check.

#### Scenario: Empty Today
- **WHEN** Today has no task on any device
- **THEN** the `today-clear` drawing is shown above "Nothing due today." in the muted text colour, with the sun in the theme's accent at low opacity, and a screen reader reads only the sentence and the action

#### Scenario: Every theme
- **WHEN** the user switches to the dark theme and then to the violet colour theme while the empty Trash is shown
- **THEN** the bin's strokes follow the muted text colour and the leaf follows the new accent, with no colour left from before

#### Scenario: Style gate on the set
- **WHEN** a contributor adds a sixth drawing with a gradient or over 4 KB of markup
- **THEN** `make ui-lint` fails naming the file
