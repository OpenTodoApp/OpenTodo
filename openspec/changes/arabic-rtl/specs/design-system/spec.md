## ADDED Requirements

### Requirement: Layout names the start and end of the line
Layout in the web app SHALL be written with logical directions (start and end, inline) so one layout serves both directions: margins, padding, insets, text alignment, borders and corner radii. The design-system check SHALL fail on a physical left or right utility in the web app's screens, primitives and helpers, except a direction-neutral centring (`left-1/2` with its translate) and a box placed by screen coordinates whose line carries a `physical:` comment with the reason.

#### Scenario: A physical margin
- **WHEN** a change adds `className="ml-2"` to a screen
- **THEN** `make ui-lint` fails, naming the file, the line and the logical twin `ms-2`

#### Scenario: Pointer-placed box
- **WHEN** a drag ghost is placed with `fixed left-0 top-0` and a transform from the pointer, with `// physical: follows the pointer` above the line
- **THEN** the check passes

### Requirement: Right-to-left stories
The design workbench SHALL render a story right to left when its parameters ask for it or its language is written right to left, and left to right otherwise, never carrying one story's direction into the next. It SHALL include right-to-left stories of the core screens (the shell with a list, a task page, Today, a project with the docked panel, Week, the sidebar, a Settings page, a phone's Today and the row swipes), checked by the accessibility and visual gates like every story.

#### Scenario: Back to left to right
- **WHEN** the workbench shows a right-to-left story, then a left-to-right one
- **THEN** the second story's document `dir` is `ltr`
