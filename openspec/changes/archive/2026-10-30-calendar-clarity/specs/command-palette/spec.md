## MODIFIED Requirements

### Requirement: Open and close the palette
The client SHALL open the palette with `Ctrl+K` (`⌘+K` on macOS) from every signed-in screen, including while a text field has focus, except inside the notes editor where the key keeps its formatting meaning; and from a search button in the header. It SHALL be a dialog with the app's overlay behaviour (full-screen sheet below 640 px, Escape closes, focus returns to where it was); from 640 px it SHALL be a card 40 rem wide near the top of the screen, without a title bar, whose accessible name stays "Search and commands". It SHALL open in Search mode with an empty, focused field. Typing `+`, `>` or `?` as the first character of the empty field SHALL switch to Add, Commands or Ask and remove the character, and a second press of the same prefix SHALL return to Search with the character kept. A segmented control offering Search, Add, Commands and, only when the assistant is available to the user, Ask SHALL be shown below 640 px and on touch screens; with a fine pointer a footer SHALL name the prefixes instead. Escape in Commands or Ask, and in Add when Add was reached from Search, SHALL return to Search before closing; Escape in Add when the palette was opened in Add mode SHALL close it. On a screen that has no quick add of its own, `q` SHALL open the palette in Add mode; on a list screen `q` keeps focusing the list's quick add. Opening, switching modes and closing touch no data.

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
- **THEN** the palette opens as a sheet with its input focused and the segmented control at its top

#### Scenario: Desktop card
- **WHEN** the user presses `Ctrl+K` on a 1440×900 screen with a mouse
- **THEN** the palette is a 40 rem card near the top of the screen with no title bar, the field at its top, and a footer that reads "Type + to add, > for commands" (and "? to ask" when the assistant is available) instead of the segmented control

#### Scenario: Prefix switches the mode
- **WHEN** the field is empty and the user types `>`
- **THEN** the palette is in Commands mode with an empty field, and typing `>` again returns to Search with `>` in the field

#### Scenario: Ask only when available
- **WHEN** the assistant is not available to the user and they type `?` in the empty field
- **THEN** the palette stays in Search mode with `?` in the field and no Ask segment is shown

#### Scenario: q where there is no quick add
- **WHEN** the user is in Settings and presses `q` outside a text field
- **THEN** the palette opens in Add mode with its field focused, in Today `q` focuses the list's quick add as before, and in Day, Week, Month and Plan `q` opens the calendar's own add dialog for the focused day

#### Scenario: Escape from Add depends on how it was reached
- **WHEN** the palette was opened with `q` in Settings and the user presses Escape with no row highlighted and no suggestion list open
- **THEN** the palette closes; and when the user had switched from Search to Add with `+`, Escape returns to Search instead
