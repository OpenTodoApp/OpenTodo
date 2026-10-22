## MODIFIED Requirements

### Requirement: Preferences in Settings
Settings SHALL offer a Date and time panel with the four preferences and a live preview of a sample date, time and week. The day start SHALL be offered as the whole hours from `00:00` (named as midnight) to `06:00`, each shown in the user's time format, with one line explaining that work done before that time counts for the previous day; the preview SHALL name the day the device currently considers today. A change SHALL apply at once, without a reload. The preview SHALL be one "Sample" box under the four rows, set in the body text style: a heading line naming today as the app names it, then the sample values as they appear in the app (a due date chip, a full date, a due time, a comment time) in a two-column grid of label and value aligned on one axis, then the week strip starting on the chosen first day with today marked; it SHALL fit within the card's width at 360 px without wrapping a value.

#### Scenario: Live preview
- **WHEN** the user switches the time format from `24h` to `12h` in Settings
- **THEN** the preview shows `3:00 PM` and open views show 12-hour times without a reload

#### Scenario: Pick a day start at night
- **WHEN** it is 01:30 on Thursday 15 October and the user sets the day start to `04:00`
- **THEN** the preview says today is Wednesday 14 October, the Today view behind the panel lists Wednesday's tasks without a reload, and the setting reaches the user's other devices on the next sync

#### Scenario: Keyboard
- **WHEN** the user tabs to the day start control and chooses a value with the arrow keys
- **THEN** the value is written and the preview updates, with no mouse

#### Scenario: Sample box on a phone
- **WHEN** the user opens Date and time at 360 px
- **THEN** the Sample box shows today's heading, four label and value lines aligned on one axis, and the week strip, with no value wrapped and nothing wider than the card
