## MODIFIED Requirements

### Requirement: Quick add tools on a phone
The phone's quick-add sheet SHALL show, under the line, a row of neutral chips for the attributes the line sets, each with a control that keeps its words as text, followed by a dashed placeholder chip for the project and for the label when the line sets none; and a tool row with buttons for a date, a priority, a label, an estimate and a project, and a send button. A tool button or a placeholder chip SHALL start that attribute's token at the end of the line (`#` for a project, `@` for a label, `p` for a priority, `+` for an estimate; for a date, the caret moves to the end of the line), keeping the keyboard up and the field focused, and opening the suggestions for `#` and `@`. The send button SHALL add the task exactly as Enter does. After a task, or a confirmed pasted list, is added from the sheet, the sheet SHALL stay open with its field empty and focused, so the next task can be typed at once, and a polite status SHALL announce that the task was added; the sheet SHALL close only when the user closes it (a tap outside, a drag down, Escape or the system Back). The sheet SHALL add tasks offline through the same local operation as every quick add.

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
