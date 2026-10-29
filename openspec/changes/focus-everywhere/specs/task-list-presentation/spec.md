# Spec Delta

## MODIFIED Requirements

### Requirement: Revealed row actions
On a fine pointer from 768 px wide, a row SHALL hold four actions at its right edge, shown while the pointer is over the row or focus is inside it as one small floating cluster on the popover surface: over the end of the property column of a one-line row, and in the place of the trailing group of a narrower row, which keeps room for them: Show details, which shows the task's details under the row as → does (Hide details while they are shown, see "Expanded rows"); Schedule, which opens the same Do on popover as `s` anchored to the row; Priority, which opens the same priority choice as `1` to `4`; and More, which opens the row menu as `.` does. The actions SHALL be real buttons at all times, reachable by Tab from the row's open control and back with Shift+Tab, named with their key in their tooltips, with targets of at least 24 by 24 CSS pixels and 8 px apart (WCAG 2.2 2.5.8), and SHALL never be obscured by the sticky page header, the selection bar or a toast when focused (WCAG 2.2 2.4.11). `j` and `k` SHALL keep moving focus from open control to open control, skipping the actions. Revealing the actions SHALL NOT change the row's height, move the title or the properties, or hide the counts or the properties from assistive technology. On coarse pointers and below 768 px the actions SHALL NOT be rendered; the row menu stays reachable by `.`, the Menu key, and the selection bar's Actions after a long press ticks the row (`bulk-actions` "One ticked task on touch"), and the row's disclosure button shows the details. Every action writes through the same path as its keyboard equivalent, so it works offline and converges per field. A viewer's row SHALL offer Show details only.

#### Scenario: Reveal on hover
- **WHEN** the pointer enters a row with two comments on a 1280 px screen
- **THEN** Show details, Schedule, Priority and More appear in a floating cluster at the row's right edge, the "2" beside the title stays, and the title does not move

#### Scenario: Reveal on focus
- **WHEN** the user presses `j` to focus a row's open control and then Tab
- **THEN** focus moves to Show details, the four actions are visible, Tab moves on to Schedule, Priority and More, Shift+Tab returns, and `j` from the open control skips them

#### Scenario: Schedule from the row
- **WHEN** the user activates Schedule on a row and picks Tomorrow
- **THEN** the task is due tomorrow, the row re-sorts or stays as the view requires, and a toast offers Undo, exactly as `s` then Tomorrow would

#### Scenario: Priority from the row
- **WHEN** the user activates Priority and chooses P1 while offline
- **THEN** the checkbox ring turns P1 at once and the change reaches other devices after the next sync

#### Scenario: Touch screen
- **WHEN** a row is shown on a coarse pointer at 1024 px
- **THEN** no action buttons are rendered, the counts stay, and a long press selects the row so its actions are in the phone bar (bulk-actions "Select with a pointer or on touch")

#### Scenario: Focus not obscured
- **WHEN** the focused More button of the last visible row sits under where a toast appears, and a toast appears
- **THEN** the list scrolls or the toast is placed so that the whole button stays visible

#### Scenario: Viewer of a shared project
- **WHEN** the user is a viewer and hovers a row
- **THEN** only Show details appears, because the row has no edits to offer
