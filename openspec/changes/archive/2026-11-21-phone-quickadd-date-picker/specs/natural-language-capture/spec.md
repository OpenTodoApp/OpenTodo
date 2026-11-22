# Spec Delta

## MODIFIED Requirements

### Requirement: Quick add tools on a phone
The phone's quick-add sheet SHALL show, under the line, a row of neutral chips for the attributes the line sets, each with a control that keeps its words as text, followed by a dashed placeholder chip for the project and for the label when the line sets none; and a tool row with buttons for a date, a priority, a label, an estimate and a project, then a Notes tool, and a send button. A tool button or a placeholder chip SHALL start that attribute's token at the end of the line (`#` for a project, `@` for a label, `p` for a priority, `+` for an estimate), keeping the keyboard up and the field focused, and opening the suggestions for `#` and `@`. The date tool SHALL instead open a date picker as a bottom sheet above the keyboard, with the field keeping focus; choosing a day, and optionally a time or no time, SHALL write the date into the line as words the parser reads back as exactly that date ("tomorrow 17:00", "Fri 28 Nov"; the ISO date only where no worded form reads back), so the date chip and the saved task come from parsing exactly as a typed date does, and SHALL replace the line's existing due date rather than add a second; clearing the picker SHALL remove that date from the line. The Notes tool SHALL open the notes field of "A wrapping line and notes in quick add" and move the caret into it with the keyboard up, and SHALL show as pressed while that field is open. The send button SHALL add the task exactly as Enter does. After a task, or a confirmed pasted list, is added from the sheet, the sheet SHALL stay open with its field empty and focused, so the next task can be typed at once, and a polite status SHALL announce that the task was added; the sheet SHALL close only when the user closes it (a tap outside, a drag down, Escape or the system Back). The sheet SHALL add tasks offline through the same local operation as every quick add.

#### Scenario: Start a project from the tool row
- **WHEN** the user has typed `Buy primer` in the phone's sheet and taps the project tool
- **THEN** the line reads `Buy primer #`, the field keeps focus with the keyboard up, and the project suggestions are open

#### Scenario: Pick a date from the tool row
- **WHEN** the user has typed `Call the plumber` and taps the date tool, then picks tomorrow at 5pm
- **THEN** the line reads `Call the plumber tomorrow 17:00`, the date chip shows tomorrow at 17:00, the field keeps focus with the keyboard up, and sending adds the task due then — the same as if the date had been typed

#### Scenario: The picker replaces an existing date
- **WHEN** the line already reads `Call the plumber tomorrow` and the user opens the date tool and picks next Monday
- **THEN** the line's `tomorrow` is replaced by next Monday's words and no second date is added

#### Scenario: Clear the picked date
- **WHEN** the line reads `Call the plumber tomorrow 17:00` and the user taps Clear in the picker
- **THEN** the line reads `Call the plumber` and no date chip is shown

#### Scenario: No dead date tool
- **WHEN** the user opens the phone's sheet
- **THEN** the tool row offers a date tool that opens the date picker, then the priority, label, estimate and project tools; no tool only moves the caret and opens nothing

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
