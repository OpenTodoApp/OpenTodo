# Spec Delta

## MODIFIED Requirements

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` quick add, `j`/`k` (or arrows) move, Enter opens, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` then `i`/`t`/`u`/`c`/`s` navigates, `g` then `p` opens Inbox triage, Escape closes the panel or clears the selection, `?` lists shortcuts, and `Ctrl`/`⌘`+`K` opens the palette. Shortcuts SHALL not fire while typing in a field, except `Ctrl`/`⌘`+`K` outside the notes editor.

#### Scenario: Navigate with g then t
- **WHEN** focus is not in a text field and the user presses `g` then `t`
- **THEN** the Today view opens

#### Scenario: Typing is not intercepted
- **WHEN** the user types the letter `c` into the quick-add field
- **THEN** no task is completed

#### Scenario: Process the Inbox with g then p
- **WHEN** focus is not in a text field and the user presses `g` then `p`
- **THEN** the Inbox triage mode opens, and the `?` overlay lists `g` then `p` under "Go to a view"

#### Scenario: Palette from a field
- **WHEN** focus is in the Filter view's query input and the user presses `Ctrl+K`
- **THEN** the palette opens and the query text is kept

#### Scenario: Cheat sheet lists the context
- **WHEN** the user presses `?` in a project list
- **THEN** the cheat sheet opens with the list shortcuts first, as specified in `keyboard-shortcuts`

### Requirement: Command line
In Normal mode `:` SHALL open a one-line command input with completion over `inbox`, `today`, `upcoming`, `completed`, `settings`, `project <name>` (prefix match), `new <title>`, `triage` (the Inbox triage mode, OpenSpec `inbox-triage`), `q` (close panel or clear selection), `sync` and `help`. Enter runs the command, Escape cancels, and an unknown command SHALL show a message without side effects. Commands that write data SHALL use the same local-first path as the equivalent interface action, so they work offline and converge like any edit.

#### Scenario: Navigate by command
- **WHEN** the user types `:tod` and accepts the completion with Enter
- **THEN** the Today view opens and the indicator returns to Normal

#### Scenario: Unknown command
- **WHEN** the user runs `:frobnicate`
- **THEN** a message "Unknown command: frobnicate" is shown and nothing else changes

#### Scenario: Create task by command while offline
- **WHEN** the device is offline, the user is in a project view and runs `:new Buy milk`
- **THEN** the task appears in that project immediately and syncs later like any quick-add entry

#### Scenario: Triage by command
- **WHEN** the user runs `:triage`
- **THEN** the Inbox triage mode opens and the indicator returns to Normal
