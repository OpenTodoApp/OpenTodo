# Spec Delta

## ADDED Requirements

### Requirement: Period choice on a phone
Below 768 px the Statistics screen SHALL have one row between the shell's bar and the tiles. The row SHALL start with one button that shows the chosen period's name and opens this week, this month, this quarter, this year and last week as a menu, the chosen one announced as checked, and SHALL end with the screen's menu. The period button's accessible name SHALL contain the period it shows, it SHALL be the first focusable control of the page, and its menu SHALL follow the menu keyboard model (arrow keys, Enter, Escape returning focus to the button). Choosing a period SHALL update the dashboard and be remembered on the device as before. Both controls SHALL be at least 44 × 44 px on a touch screen, and the row SHALL stay one row at 360 px in every interface language. From 768 px the period chooser SHALL be the radio group of five, as before. The row is device chrome: it reads and writes no task data, sends nothing, and works offline like the rest of the screen; there is nothing to converge.

#### Scenario: A small phone
- **WHEN** Statistics is opened on a 360 px touch screen with this week chosen
- **THEN** the row under the bar shows a button reading "This week" and the menu button at its end, and the tiles start directly under that row

#### Scenario: Choose a period by tap
- **WHEN** the user taps "This week" and chooses This quarter
- **THEN** the button reads "This quarter", the tiles and panels show the quarter, and opening the menu again shows This quarter checked

#### Scenario: Choose a period by keyboard
- **WHEN** the user focuses the period button, presses Enter, ArrowDown and Enter
- **THEN** This month is chosen and focus is back on the period button

#### Scenario: Longer words
- **WHEN** Statistics is opened at 360 px in German or Italian
- **THEN** the period button and the menu button share one row and the page does not scroll sideways

#### Scenario: Wider screens
- **WHEN** Statistics is opened on a 768 px or a 1280 px screen
- **THEN** the header shows the five periods as a radio group and the arrow keys change the period, as before
