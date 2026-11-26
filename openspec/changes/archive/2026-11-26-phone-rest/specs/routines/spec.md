## ADDED Requirements

### Requirement: A routine's row on a narrow screen
Below 640 px a routine's row on the Routines page SHALL hold its switch, its text and its menu, and SHALL NOT show the Run now button, so the name and the sentence have the row's width; Run now SHALL be an item of the row's menu at every width, and from 640 px the row SHALL also show the Run now button. Run now from the menu SHALL behave as the button does, and needs a connection as before.

#### Scenario: A phone at 360 px
- **WHEN** the Routines page is open at 360 px with the routine "Groceries every Friday"
- **THEN** its row shows the switch, the name, the sentence and the menu button, and no Run now button

#### Scenario: Run now from the menu
- **WHEN** the user opens the row's menu at 360 px and taps Run now
- **THEN** the routine runs as it does from the button

#### Scenario: A wide screen
- **WHEN** the Routines page is open at 700 px
- **THEN** the row shows the Run now button beside the menu
