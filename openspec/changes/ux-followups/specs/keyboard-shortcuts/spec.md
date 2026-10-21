## MODIFIED Requirements

### Requirement: Cheat sheet
`?` SHALL open a cheat sheet dialog that lists, first, the shortcuts of the scopes active right now, then "Everywhere" and "Go to", then the remaining sections, each as a titled group. Each shortcut SHALL be one row with its short label (or its description clamped to one line, with the full description in the row's accessible name and tooltip) and, aligned to the end of the row, its keys as separate keycaps: the chords of a sequence joined by "then", alternatives joined by "or", and a condition shown as muted text under the label, never inside a keycap. A keycap SHALL never wrap, and keys and text SHALL never overlap at any width from 360 px. Groups SHALL flow in one column below 768 px, two from 768 px and three from 1280 px. The sheet SHALL have a search field that stays visible while the list scrolls and filters by key, label or description, SHALL be at most 80 % of the viewport height with its own scroller, and SHALL render from the registry. After the shortcuts it SHALL list the quick add syntax, including a line for the `#` and `@` suggestions.

#### Scenario: Context first
- **WHEN** the user presses `?` while a board is shown
- **THEN** the first group is "Board", followed by "Tasks in a list", "Everywhere" and "Go to"

#### Scenario: Search the sheet
- **WHEN** the sheet is open and the user types "dead"
- **THEN** only the deadline shortcuts remain, across every group

#### Scenario: Fits the screen
- **WHEN** the sheet opens on a 1280×800 screen
- **THEN** its header, search field and close button are visible, its groups are in three columns, and its content scrolls inside the dialog

#### Scenario: Sequences and alternatives read as keys
- **WHEN** the sheet shows "Go to Today" and "Move the selection down"
- **THEN** the first row's keys read as the keycaps `g` then `t`, and the second's as `j` or `↓`, each keycap on one line

#### Scenario: Nothing overlaps on a phone
- **WHEN** the sheet is open at 360 px wide
- **THEN** every row's keycaps sit on its own lines without touching the label or the next row, and the layout check finds no overlapping boxes in the sheet

#### Scenario: Conditions outside the keys
- **WHEN** the sheet lists the shortcut that applies or discards proposed changes
- **THEN** its keycaps read `Enter` or `Esc`, and "proposed changes" is muted text under the label, not inside a keycap

#### Scenario: Suggestions are discoverable
- **WHEN** the user opens the cheat sheet and searches for `@`
- **THEN** a quick add row says that `#` or `@` followed by a few letters suggests projects or labels, that Enter or Tab picks, and that `#Home/Docs` picks a sub-project
