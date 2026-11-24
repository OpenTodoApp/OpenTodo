# Spec Delta

## ADDED Requirements

### Requirement: Field buttons in quick add in a list
While recognition is on and the window is at least 640 px wide, quick add in a list SHALL show, beside the calendar button of "A calendar in quick add on the web", a Priority, a Project and a Label button. A button for a field the line does not set SHALL start that field's token at the end of the line (`p`, `#`, `@`, after one space), keep the field focused and open the suggestions for it (the levels `p1`–`p4`, the projects, the labels); a button for a field the line sets SHALL select the words that set it and show in the default tone. Picking a suggestion SHALL write the same token as typing it, so the chips and the saved task come from parsing exactly as typed text does. A click SHALL keep the focus in the field; each button SHALL be reachable with the keyboard after the field and named by its field. Starting a priority from the palette's Priority row or the phone sheet's priority tool SHALL open the same levels. The buttons write only the line, so they have no offline or convergence behaviour of their own.

#### Scenario: Pick a project
- **WHEN** the user types `Buy primer` in a list's quick add, clicks Project and picks Home
- **THEN** the line reads `Buy primer #Home`, the field keeps focus, and adding saves the task in Home

#### Scenario: Pick a priority
- **WHEN** the user types `Call the bank`, clicks Priority and picks `p1`
- **THEN** the line reads `Call the bank p1` and adding saves the task with priority 1

#### Scenario: A label
- **WHEN** the user types `Fix the bike`, clicks Label and picks errands
- **THEN** the line reads `Fix the bike @errands` and adding saves the task with that label

#### Scenario: A set field
- **WHEN** the line reads `Buy primer #Home` and the user clicks Project
- **THEN** `#Home` is selected in the field

#### Scenario: Recognition off
- **WHEN** recognition is off in the quick-add settings
- **THEN** no field button is shown beside the field
