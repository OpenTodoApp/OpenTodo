# Spec Delta

## MODIFIED Requirements

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` focuses quick add, `j`/`k` (or arrows) move the selection, Enter opens, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` followed by `i`/`t`/`u`/`c`/`s` navigates, `g` then `r` opens the Review and `g` then `Shift+S` opens Statistics, Escape closes the panel or clears the selection, and `?` shows the shortcut list. Shortcuts SHALL not fire while typing in a field.

#### Scenario: Navigate with g then t
- **WHEN** focus is not in a text field and the user presses `g` then `t`
- **THEN** the Today view opens

#### Scenario: Navigate to the review and the statistics
- **WHEN** focus is not in a text field and the user presses `g` then `r`, and later `g` then `Shift+S`
- **THEN** the Review screen opens, and then the Statistics screen

#### Scenario: Typing is not intercepted
- **WHEN** the user types the letter `c` into the quick-add field
- **THEN** no task is completed
