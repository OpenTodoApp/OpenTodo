## MODIFIED Requirements

### Requirement: The selection bar stays in sight
While tasks are ticked, the selection bar SHALL float over the bottom of the content and SHALL take no room in the list, so it appearing, changing or leaving never moves a row. Below 768 px it SHALL stand just above the tab bar and the bottom safe area, where the floating add button stands, and the add button SHALL step aside while the bar shows and return when it leaves. From 768 px it SHALL stand over the bottom of the content surface, and a toast in the bottom corner SHALL rise above it. The bar SHALL stay visible as the list scrolls, the content SHALL keep room under its last row so every row can be scrolled clear of the bar, and a row moved to with the keyboard SHALL be kept above the bar as well as below the header. This is presentation only and behaves the same offline.

#### Scenario: Ticking does not move the list
- **WHEN** a user on a 390 px phone ticks a task in Today and then taps the row that was under their finger before
- **THEN** every row is where it was before the tick, the bar shows above the tab bar, the add button is out of the way, and the tap lands on the row the user aimed at

#### Scenario: Ticking far down a long list
- **WHEN** the user scrolls to the end of a 40-task project and Shift+clicks a range of tasks there
- **THEN** the bar with the count, Actions and Clear shows over the bottom of the content without scrolling, and the last task can be scrolled above it

#### Scenario: Keyboard cursor under the bar
- **WHEN** tasks are ticked and the user moves down the list with the arrow keys
- **THEN** every selected row stays fully visible above the selection bar, never under it

#### Scenario: Clearing
- **WHEN** the user presses Escape with three tasks ticked
- **THEN** the bar leaves, no row moves, and on a phone the add button returns
