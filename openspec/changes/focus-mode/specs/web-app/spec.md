# Spec Delta

## ADDED Requirements

### Requirement: Keyboard navigation to Focus
Outside text fields, `g` then `Shift+F` SHALL open the Focus screen (OpenSpec change `focus-mode`), like the other `g` navigation keys, and the `?` cheat sheet SHALL list it under "Go to a view". On the Focus screen itself Space, Enter, Esc, `b` and `n` SHALL be the view's own keys and SHALL not run any list or panel shortcut.

#### Scenario: Navigate to Focus
- **WHEN** focus is not in a text field and the user presses `g` then `Shift+F`
- **THEN** the Focus screen opens on the first task of today's focus, or on its task picker when there is none

#### Scenario: No list keys on the Focus screen
- **WHEN** the Focus screen is shown and the user presses `c` or `j`
- **THEN** nothing happens, because the screen hosts no task list
