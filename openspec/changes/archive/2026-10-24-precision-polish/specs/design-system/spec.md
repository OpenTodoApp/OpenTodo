## ADDED Requirements

### Requirement: Grey selection, accent for state
A row or item the user is on (the keyboard cursor, the selected row, the current item of a list such as the workspace list, a time list or the sidebar's footer buttons) SHALL use the selected-row surface for rows and the selected surface with the strong text tone for items, never the accent tint; the selection bar above a list SHALL use the selected surface. The accent tint SHALL be kept for state: a bulk tick, a bordered choice card showing the value the user picked, a highlighted linked comment, done and now. A page header that introduces a step (as in the weekly review) SHALL NOT be tinted. A heading that receives focus from code so a screen reader announces it, and that is not a Tab stop, SHALL NOT draw a focus ring.

#### Scenario: Selected row in the Trash
- **WHEN** the user moves the cursor to an item in the Trash, in light or dark
- **THEN** the row uses the selected-row surface, the same as a selected task row, and no green tint

#### Scenario: Selection bar
- **WHEN** three tasks are ticked
- **THEN** "3 selected · Actions · Clear" sits on the grey selected surface with no accent border, and the ticked rows keep their accent tint

#### Scenario: Weekly review step
- **WHEN** the weekly review moves to a new step
- **THEN** its header has no tint, its icon sits on the raised surface in the muted tone, the step title receives focus for a screen reader, and no focus ring is drawn around it

### Requirement: Breakpoints follow the text size
Every layout decision a script makes from the viewport width (phone or desktop header, drawer or sidebar, the task split, two-column settings, toast and overlay placement) SHALL use the same rem breakpoints as the stylesheet (40, 48 and 64 rem), so a browser text size other than the default moves script and stylesheet breakpoints together. At the default text size of 16 px the layout SHALL be unchanged. A control whose label would push a page title off a phone at a large text size MAY keep only its icon below 21 rem of viewport, keeping its accessible name.

#### Scenario: Large text between 768 and 960 px
- **WHEN** the browser's text size is 20 px and the window is 900 px wide
- **THEN** the app uses the phone layout with the drawer, as the stylesheet does, and the sidebar is reachable from the menu button

#### Scenario: Large text on a 1100 px window
- **WHEN** the browser's text size is 20 px and the Inbox is opened in a 1100 px window
- **THEN** selecting a task opens its page instead of docking it beside the list, because the detail pane is not shown below 64 rem

#### Scenario: Process on a phone with large text
- **WHEN** the Inbox is opened at 360 px with the browser's text size at 24 px
- **THEN** the Process button shows its icon only, its accessible name is still "Process", and the page title "Inbox" is readable beside it
