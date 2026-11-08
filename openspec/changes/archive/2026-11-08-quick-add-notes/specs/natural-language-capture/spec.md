## ADDED Requirements

### Requirement: A wrapping line and notes in quick add
Quick add's field SHALL wrap a long title onto further lines and grow with it up to five lines, then scroll vertically; it SHALL never scroll sideways. The title SHALL stay one line of text: Enter SHALL add the task, and a line break pasted into a field that holds text, or dictated, SHALL become a space (a multi-line paste into an empty field stays the paste offer). The controls beside the field SHALL stay beside its first line, and the inline tints SHALL wrap with the text.

Shift+Enter in the field SHALL open a notes field under it and move the caret there, except in the command bar's Add mode, where Shift+Enter keeps adding and opening the task, and on a screen that has its own notes field for the new task (the share screen). The text of the notes field SHALL be saved as the new task's notes, trimmed and never parsed, in the same local operation that creates the task, so it works offline and converges like any task field. In the notes field Enter SHALL add the task, Shift+Enter SHALL insert a line break, and Backspace in the empty field SHALL close it and put the caret at the end of the title. The notes field SHALL grow up to six lines, then scroll. After an add both fields SHALL be empty and the notes field closed.

#### Scenario: A long title wraps
- **WHEN** the user types a title longer than the field's width
- **THEN** the field shows it on two or more lines with no sideways scroll, and Enter adds the task with the whole title

#### Scenario: Notes while adding
- **WHEN** the user types `Read the article tomorrow`, presses Shift+Enter, types `https://example.com/article` and presses Enter
- **THEN** a task "Read the article" due tomorrow is added with the notes `https://example.com/article`, and quick add is empty with its notes field closed

#### Scenario: Notes are never parsed
- **WHEN** the notes field holds `tomorrow #work p1` and the line holds `Pay rent`
- **THEN** the task "Pay rent" is added with no date, project or priority from the notes, and its notes read `tomorrow #work p1`

#### Scenario: Closing empty notes
- **WHEN** the notes field is open and empty and the user presses Backspace
- **THEN** the notes field closes and the caret is at the end of the title

#### Scenario: The command bar keeps add and open
- **WHEN** the user presses Shift+Enter in the command bar's Add mode
- **THEN** the task is added and opened, and no notes field opens

## MODIFIED Requirements

### Requirement: Quick add tools on a phone
The phone's quick-add sheet SHALL show, under the line, a row of neutral chips for the attributes the line sets, each with a control that keeps its words as text, followed by a dashed placeholder chip for the project and for the label when the line sets none; and a tool row with buttons for a date, a priority, a label, an estimate and a project, then a Notes tool, and a send button. A tool button or a placeholder chip SHALL start that attribute's token at the end of the line (`#` for a project, `@` for a label, `p` for a priority, `+` for an estimate; for a date, the caret moves to the end of the line), keeping the keyboard up and the field focused, and opening the suggestions for `#` and `@`. The Notes tool SHALL open the notes field of "A wrapping line and notes in quick add" and move the caret into it with the keyboard up, and SHALL show as pressed while that field is open. The send button SHALL add the task exactly as Enter does. After a task, or a confirmed pasted list, is added from the sheet, the sheet SHALL stay open with its field empty and focused, so the next task can be typed at once, and a polite status SHALL announce that the task was added; the sheet SHALL close only when the user closes it (a tap outside, a drag down, Escape or the system Back). The sheet SHALL add tasks offline through the same local operation as every quick add.

#### Scenario: Start a project from the tool row
- **WHEN** the user has typed `Buy primer` in the phone's sheet and taps the project tool
- **THEN** the line reads `Buy primer #`, the field keeps focus with the keyboard up, and the project suggestions are open

#### Scenario: Chips for what is understood
- **WHEN** a project "Home renovation" exists and the user types `Call Mia about the tiles tomorrow 5pm #HomeRenovation`
- **THEN** the chip row shows a date chip reading tomorrow at 17:00 and a project chip "Home renovation", and a dashed "Label" placeholder

#### Scenario: Send offline
- **WHEN** the device is offline and the user taps send with `Water the plants`
- **THEN** the task appears at once in the current view with its defaults and syncs when the connection returns

#### Scenario: Keep adding
- **WHEN** the user opens the sheet in the Inbox, sends `Buy milk`, then types `Buy bread` and presses Enter
- **THEN** both tasks are in the Inbox in that order, the sheet is still open with an empty, focused field, and it closes only on Escape or a tap outside

#### Scenario: Notes from the tool row
- **WHEN** the user types `Read the article` in the sheet, taps the Notes tool, types `https://example.com/article` and taps send
- **THEN** the task "Read the article" is added with those notes, and the keyboard stayed up throughout
