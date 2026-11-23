# Spec Delta

## ADDED Requirements

### Requirement: A calendar in quick add on the web
While recognition is on, quick add on the web SHALL offer the date picker of "Quick add tools on a phone": in the quick-add palette, editing the **When** row (a click, or Tab on the highlighted row) SHALL open it under the rows; in quick add in a list, a calendar button beside the field SHALL open it under the line. The picker SHALL offer quick dates, a month calendar, times and Clear, SHALL write a picked day (and time) into the line as words the parser reads back as exactly that date, replacing the line's existing due date and any other words of the When field (`someday`, `this week`, `evening`), and SHALL remove that date on Clear, exactly as on the phone. Escape SHALL close the open picker before anything else, keeping the field focused and the quick add open. A click in the picker SHALL keep the focus in the field; its controls SHALL be reachable with the keyboard. Typing a date SHALL keep working as before. The picker writes only the line, so it has no offline or convergence behaviour of its own.

#### Scenario: Pick from the palette
- **WHEN** the user types `Call the plumber` in the quick-add palette, clicks the When row and picks tomorrow
- **THEN** the line reads `Call the plumber tomorrow`, the When row shows tomorrow and the field keeps focus

#### Scenario: Pick from a list
- **WHEN** the user types `Call the plumber` in a list's quick add, opens the calendar beside the field and picks a day three days on
- **THEN** the line ends with that day's words and adding saves the task due that day

#### Scenario: Someday replaced by a day
- **WHEN** the palette's line reads `Call the plumber someday` and the user picks tomorrow from the When row
- **THEN** the line reads `Call the plumber tomorrow` and the task is saved with the title `Call the plumber`

#### Scenario: Escape closes the picker first
- **WHEN** the picker is open in the palette and the user presses Escape
- **THEN** the picker closes, the field keeps focus and the palette stays open

#### Scenario: Recognition off
- **WHEN** recognition is off in the quick-add settings
- **THEN** no calendar button is shown and the When row does not open a picker
