# Spec Delta

## MODIFIED Requirements

### Requirement: Open and close the palette
The client SHALL open the palette with `Ctrl+K` (`⌘+K` on macOS) from every signed-in screen, including while a text field has focus, except inside the notes editor where the key keeps its formatting meaning; and from a search button in the header. It SHALL be a dialog with the app's overlay behaviour (bottom sheet below 640 px, Escape closes, focus returns to where it was). It SHALL open in Search mode with an empty, focused field and a segmented control offering Search, Add, Commands and, only when the assistant is available to the user, Ask; typing `+`, `>` or `?` as the first character of the empty field SHALL switch to Add, Commands or Ask and remove the character, a second press of the same prefix SHALL return to Search with the character kept, and Escape in a non-Search mode SHALL return to Search before closing. On a screen that has no quick add of its own, `q` SHALL open the palette in Add mode; on a list screen `q` keeps focusing the list's quick add. Opening, switching modes and closing touch no data.

#### Scenario: Open from a list
- **WHEN** the user is in the Today view and presses `Ctrl+K`
- **THEN** the palette opens in Search mode with an empty, focused input and the browser's own `Ctrl+K` action does not run

#### Scenario: Open while typing in quick add
- **WHEN** focus is in the quick-add field and the user presses `⌘+K` on a Mac
- **THEN** the palette opens and the quick-add text is kept

#### Scenario: Notes editor keeps its shortcut
- **WHEN** focus is in a task's notes editor and the user presses `Ctrl+K`
- **THEN** the editor's link command runs and the palette does not open

#### Scenario: Escape and focus
- **WHEN** the palette is open in Search mode and the user presses Escape
- **THEN** it closes without running anything and focus returns to the element that had it before

#### Scenario: Touch
- **WHEN** a user on a phone taps the header's search button
- **THEN** the palette opens as a bottom sheet with its input focused and the segmented control under it

#### Scenario: Prefix switches the mode
- **WHEN** the field is empty and the user types `>`
- **THEN** the palette is in Commands mode with an empty field, and typing `>` again returns to Search with `>` in the field

#### Scenario: Ask only when available
- **WHEN** the assistant is not available to the user and they type `?` in the empty field
- **THEN** the palette stays in Search mode with `?` in the field and no Ask segment is shown

#### Scenario: q where there is no quick add
- **WHEN** the user is in Settings or the Week view and presses `q` outside a text field
- **THEN** the palette opens in Add mode with its field focused, and in Today `q` focuses the list's quick add as before

## ADDED Requirements

### Requirement: Add mode
In Add mode the palette's field SHALL be the quick add, with the defaults of the screen it was opened from (today's date in Today, the project in a project, the Inbox elsewhere), the inline highlighting and preview chips of `natural-language-capture`, and the "→ title" preview. Enter SHALL create the task through the same local-first path as the list's quick add, show the same "Added to …" toast, and keep the palette open with an empty field; Escape SHALL return to Search. Add mode SHALL work offline exactly like the quick add.

#### Scenario: Add from Settings
- **WHEN** the user presses `q` in Settings, types `Call Sam tomorrow at 4pm @call` and presses Enter
- **THEN** a task "Call Sam" is in the Inbox due tomorrow at 16:00 with the label call, the toast reads "Added to Inbox · Open", and the field is empty and still focused

#### Scenario: Add in a project
- **WHEN** the palette is opened from the project "Home" and switched to Add with `+`, and the user adds `Fix the tap`
- **THEN** the task is created in Home, and the project chip is shown in the preview before Enter

#### Scenario: Offline
- **WHEN** the device is offline and the user adds a task from Add mode
- **THEN** the task appears at once in its list and syncs when the connection returns

### Requirement: Add as a task from Search
In Search mode, while the field holds text, the last entry SHALL always be "Add '<text>' as a task", and `Ctrl`/`⌘`+`Enter` SHALL activate it without moving to it. It SHALL never be the first entry, so Enter on a search never creates a task. Activating it SHALL create the task as Add mode does and close the palette.

#### Scenario: Last entry
- **WHEN** the user types `passport` and two tasks match
- **THEN** the two tasks are listed first and "Add 'passport' as a task" is the last entry

#### Scenario: Ctrl+Enter
- **WHEN** the user has typed `Buy stamps` with no match and presses `Ctrl+Enter`
- **THEN** a task "Buy stamps" is created in the Inbox, the palette closes and the toast offers Open

### Requirement: Ask mode
In Ask mode, shown only when the assistant is available to the user, Enter SHALL open the assistant panel and send the field's text as one turn, exactly as the Ask composer does, and close the palette. Nothing SHALL be sent before Enter.

#### Scenario: Ask
- **WHEN** a user with the assistant available types `?what is overdue in Work` and presses Enter
- **THEN** the assistant panel opens with that message sent as a turn, and the palette is closed

#### Scenario: Typing sends nothing
- **WHEN** the user types in Ask mode and closes the palette with Escape
- **THEN** no request is made to the assistant route
