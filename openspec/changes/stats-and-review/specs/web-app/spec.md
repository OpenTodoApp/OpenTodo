# Spec Delta

## MODIFIED Requirements

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` quick add, `j`/`k` (or arrows) move, Enter opens, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` then `i`/`t`/`u`/`c`/`s` navigates, `g` then `r` opens the Review and `g` then `Shift+S` Statistics, Escape closes the panel or clears the selection, `?` lists shortcuts, and `Ctrl`/`⌘`+`K` opens the palette. Shortcuts SHALL not fire while typing, except `Ctrl`/`⌘`+`K` outside the notes editor.

#### Scenario: Navigate with g then t
- **WHEN** focus is not in a text field and the user presses `g` then `t`
- **THEN** the Today view opens

#### Scenario: Navigate to the review and the statistics
- **WHEN** focus is not in a text field and the user presses `g` then `r`, and later `g` then `Shift+S`
- **THEN** the Review screen opens, and then the Statistics screen

#### Scenario: Typing is not intercepted
- **WHEN** the user types the letter `c` into the quick-add field
- **THEN** no task is completed

#### Scenario: Palette from a field
- **WHEN** focus is in the Filter view's query input and the user presses `Ctrl+K`
- **THEN** the palette opens and the query text is kept
