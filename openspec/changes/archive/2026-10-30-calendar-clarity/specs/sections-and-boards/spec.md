## ADDED Requirements

### Requirement: Colour by on boards
Boards (a project's Board layout and board views) SHALL offer Colour by with Project (default), Label and Priority, in a board view's display panel and in a project board's overflow menu, stored once per device for every board and never synced. With Label or Priority, each card SHALL show a 3 px leading edge in the hue chosen as for calendar blocks (first coloured label in the user's label order, or the priority hue; the neutral hue otherwise); with Project, cards SHALL look as before. The edge SHALL meet 3:1 against the card in light and dark, and the card's accessible text SHALL be unchanged.

#### Scenario: Cards by label
- **WHEN** the user chooses Colour by Label on a board and a card carries the label "urgent" (red)
- **THEN** the card has a red leading edge, and a card without labels has the neutral edge

#### Scenario: Project unchanged
- **WHEN** Colour by is Project
- **THEN** every board renders exactly as before

#### Scenario: Remembered on the device
- **WHEN** the user colours a board view by priority and opens a project's board after a reload
- **THEN** the project board is coloured by priority too, and other devices are unaffected
