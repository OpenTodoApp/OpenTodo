## ADDED Requirements

### Requirement: The docked note's width
On a screen of at least 1024 px, the standalone note open beside the Notes list SHALL have a resize handle on its left edge, as the docked task has: dragging it SHALL set the pane's width, a click without dragging SHALL switch between the widest width and the default, and with focus on it ← SHALL widen and → SHALL narrow the pane (Shift for larger steps), and Home SHALL restore the default. The width SHALL stay between 22 rem and what leaves 38 rem for the sidebar and the list. The width SHALL be kept on the device only, never synced, apart from the docked task's width, and SHALL be applied when a note opens again on that device; storage being unavailable SHALL keep the width for the visit. The note's title, text, Project and Labels SHALL stand in one column at most 40 rem wide, centred when the pane is wider, with padding on both sides. Below 1024 px the note SHALL open as its page, unchanged. Offline it works the same, since nothing is sent; there is nothing to converge.

#### Scenario: Drag the edge
- **WHEN** the user on a 1600 px screen opens a note on the Notes page and drags the pane's left edge 120 px to the left
- **THEN** the pane is 120 px wider, and the next note opened on this device opens at that width

#### Scenario: Keyboard
- **WHEN** the user focuses the pane's edge and presses ← twice, then Home
- **THEN** the pane widens by two steps, then returns to its default width

#### Scenario: Click for the widest
- **WHEN** the user clicks the pane's edge without dragging, then clicks it again
- **THEN** the pane takes the widest width, then its default width again

#### Scenario: Apart from the task panel
- **WHEN** the user has widened the task side panel and opens a note on the Notes page
- **THEN** the note opens at its own width, and resizing it leaves the task panel's width as it was

#### Scenario: A readable column
- **WHEN** the note pane is 60 rem wide
- **THEN** the note's text stands in a centred column at most 40 rem wide

#### Scenario: Phone
- **WHEN** the user on a 390 px phone opens a note on the Notes page
- **THEN** the note opens as its page, without a resize handle
