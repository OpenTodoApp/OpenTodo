## ADDED Requirements

### Requirement: Daily note keys
The shortcut registry SHALL register `g j` (`go.dailyNote`, global scope) opening today's daily note while the user's Daily notes setting is on, and `[` and `]` in the daily-note scope opening the previous and next day while no text field has focus. The registry's conflict check SHALL cover them, the keyboard guide SHALL list them, and `g j` SHALL do nothing while the setting is off.

#### Scenario: Listed in the guide
- **WHEN** the keyboard guide is generated with `make docs`
- **THEN** it lists `g j` under Go and `[` and `]` under Daily notes, and the conflict test passes

#### Scenario: In a text field
- **WHEN** the caret is in a daily note's text and the user types `[`
- **THEN** the character is typed and no other day opens
