## ADDED Requirements

### Requirement: Room under the floating add button
Below 768 px every screen that shows the floating add button SHALL be scrollable until its last control is clear of the button, the tab bar and the bottom safe area. The room SHALL come from one shared rule: the content column keeps the button's footprint at its end while the button is offered. A screen that fills the column and scrolls inside itself (the calendar's Day and Week grid, the notes graph) SHALL run down to the tab bar and keep that room at the end of its own scroller, or keep its controls above the button where nothing scrolls. A screen that does not show the add button SHALL keep no room for it, and from 768 px no screen SHALL. A screen whose content already ends above the button SHALL NOT scroll because of the room. The rule is layout only: it reads and writes no data, and is the same offline.

#### Scenario: The last hour of the day
- **WHEN** the calendar's Day is scrolled to its end on a 360 × 740 phone
- **THEN** the 23:00 hour and a block in it are above the add button, and nothing that can be tapped is under the button

#### Scenario: The grid reaches the tab bar
- **WHEN** the calendar's Day or Week opens on a 390 × 844 phone
- **THEN** the grid runs down to the tab bar, with the add button over it, and the page itself does not scroll

#### Scenario: No room without the button
- **WHEN** Statistics, the Trash or a step of the Weekly review is scrolled to its end on a phone
- **THEN** its content ends at the tab bar, with no empty band the height of the add button under it

#### Scenario: A short page does not scroll
- **WHEN** the Inbox holds three tasks on a 390 × 844 phone
- **THEN** the page does not scroll

#### Scenario: From 768 px
- **WHEN** the calendar's Day or a list is open at 768 px or wider
- **THEN** no room for the add button is kept at the end of the page or of the grid
