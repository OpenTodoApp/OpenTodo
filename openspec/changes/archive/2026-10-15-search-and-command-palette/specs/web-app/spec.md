# Spec Delta

## MODIFIED Requirements

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` focuses quick add, `j`/`k` (or arrows) move the selection, Enter opens, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` followed by `i`/`t`/`u`/`c`/`s` navigates, Escape closes the panel or clears the selection, `?` shows the shortcut list, and `Ctrl+K` (`⌘+K` on macOS) opens the search and command palette. Shortcuts SHALL not fire while typing in a field, except `Ctrl`/`⌘`+`K`, which SHALL open the palette from any field other than the notes editor.

#### Scenario: Navigate with g then t
- **WHEN** focus is not in a text field and the user presses `g` then `t`
- **THEN** the Today view opens

#### Scenario: Typing is not intercepted
- **WHEN** the user types the letter `c` into the quick-add field
- **THEN** no task is completed

#### Scenario: Palette from a field
- **WHEN** focus is in the Filter view's query input and the user presses `Ctrl+K`
- **THEN** the palette opens and the query text is kept
