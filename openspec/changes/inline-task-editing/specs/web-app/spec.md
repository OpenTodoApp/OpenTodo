# Spec Delta

## MODIFIED Requirements

### Requirement: Task detail panel
Opening a task SHALL show a panel in the shell's panel slot (see `app-shell`) for editing title, notes, project, priority, dates and every other task property, with complete, delete and close actions. The panel SHALL show only the properties that have a value and offer the rest from an Add menu. A task SHALL open in the panel from Enter on a selected row, from Open details or `Shift+Enter` in the inline editor, and from a click on a row's title when the inline editor does not apply (see `task-list-presentation` "Inline title editing"). On narrow screens the panel SHALL open as a full-screen sheet over the list.

#### Scenario: Open from the list
- **WHEN** the user presses Enter on a selected task, or taps a task's title on a touch screen
- **THEN** the detail panel opens with that task's fields and the address carries the task id

#### Scenario: Click edits in place on a desktop
- **WHEN** the panel is closed and the user clicks a task's title with a mouse on a 1280 px wide screen
- **THEN** the title becomes editable in the list and the panel does not open

#### Scenario: Empty task shows few things
- **WHEN** the user opens a task with a title, a project and nothing else
- **THEN** the panel shows the title, the notes placeholder, the project, the When and priority values, the subtask line and the Add menu, and no other property

### Requirement: Keyboard navigation
Every primary action SHALL be reachable from the keyboard: `q` quick add, `j`/`k` (or arrows) move, Enter opens, `F2` edits the selected task's title in place, `c` completes or reopens, `1`–`4` set priority, Delete deletes, `g` then `i`/`t`/`u`/`c`/`s` navigates, `g` then `p` opens Inbox triage, Escape closes the panel or clears the selection, `?` lists shortcuts, and `Ctrl`/`⌘`+`K` opens the palette. Shortcuts SHALL not fire while typing in a field, except `Ctrl`/`⌘`+`K` outside the notes editor.

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

#### Scenario: Rename in place from the keyboard
- **WHEN** a task is selected and the user presses `F2`, types a new title and presses Enter
- **THEN** the title is saved in the list without opening the panel
