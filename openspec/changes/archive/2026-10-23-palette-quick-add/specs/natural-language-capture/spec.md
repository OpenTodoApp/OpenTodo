## MODIFIED Requirements

### Requirement: Live preview chips
While the user types, the client SHALL show each recognised attribute (due, project, label, priority, estimate, recurrence, reminder) and the title as it will be saved, and SHALL tint each recognised span inside the field itself in that attribute's soft colour, aligned with the typed text, so the preview explains and the field shows where. The preview and the tints SHALL update on every keystroke and be announced without stealing focus; the tints SHALL be decorative, so assistive technology reads the field's text and the preview only. A dismissed token SHALL lose its tint. Under the high-contrast presentation the tint SHALL be a one-pixel underline in the attribute's colour. A link to the quick add guide SHALL appear beside the chips during the first three uses on a device and in the input's tooltip afterwards; no shortcut badge SHALL be printed unless shortcut hints are on. The same field, parsing and tints SHALL be used by every quick add: the list's line, the phone's sheet, the capture screen and the command bar's Add mode. The preview SHALL take the form of its place: one dismissible chip per attribute under the list's line, the capture screen and the title editors; one field row per attribute in the command bar's Add mode (`command-palette` "Add mode"); and one neutral dismissible chip per attribute in the phone's sheet ("Quick add tools on a phone"). Every form SHALL offer the same dismissal and SHALL produce the same task for the same line.

#### Scenario: Chips appear as tokens are typed
- **WHEN** the user has typed `Buy milk tomorrow p2`
- **THEN** a due chip reading tomorrow's date and a priority chip reading `P2` are shown, the title preview reads `Buy milk`, and in the field `tomorrow` carries the due tint and `p2` the priority tint

#### Scenario: Chips disappear when text changes
- **WHEN** the user deletes `p2` from the line
- **THEN** the priority chip and its tint disappear and the task would be created with priority 4

#### Scenario: Guide link fades out
- **WHEN** the user has added four tasks on this device
- **THEN** the guide link is no longer shown beside the chips and is available from the input's tooltip and the Help action

#### Scenario: Recurrence and reminder chips
- **WHEN** today is Friday 2026-10-09 and the user has typed `Water plants every Monday remind me at 8`
- **THEN** a recurrence chip reads `every monday · Mon 12 Oct`, a reminder chip reads `1 hour before`, and the title preview reads `Water plants`

#### Scenario: Dismissing the recurrence chip keeps the text
- **WHEN** the user dismisses the recurrence chip, or presses Backspace twice with the caret at the end of `Water plants every Monday`
- **THEN** the title is `Water plants every Monday`, no rule is set, the chip does not reappear while that text is unchanged, and `every Monday` carries no tint

#### Scenario: Quoted phrase is not a reminder
- **WHEN** the user enters `Read "remind me at 9" essay`
- **THEN** no reminder is created, the quoted span carries no tint, and the title is `Read remind me at 9 essay`

#### Scenario: Screen reader
- **WHEN** a screen reader user types `Call Ana friday`
- **THEN** the field reads back `Call Ana friday`, the due chip is announced, and nothing is announced for the tint

#### Scenario: High contrast
- **WHEN** the high-contrast presentation is on and the user types `Pay rent p1`
- **THEN** `p1` is underlined in the priority colour instead of tinted

#### Scenario: Same line, same task in every form
- **WHEN** the user enters `Pay rent friday p1 +15m` once in Today's quick-add line, once in the command bar's Add mode opened from Today and once in the phone's sheet in Today
- **THEN** the three tasks have the same title, due date, priority and estimate

## ADDED Requirements

### Requirement: Quick add tools on a phone
The phone's quick-add sheet SHALL show, under the line, a row of neutral chips for the attributes the line sets, each with a control that keeps its words as text, followed by a dashed placeholder chip for the project and for the label when the line sets none; and a tool row with buttons for a date, a priority, a label, an estimate and a project, and a send button. A tool button or a placeholder chip SHALL start that attribute's token at the end of the line (`#` for a project, `@` for a label, `p` for a priority, `+` for an estimate; for a date, the caret moves to the end of the line), keeping the keyboard up and the field focused, and opening the suggestions for `#` and `@`. The send button SHALL add the task exactly as Enter does. The sheet SHALL add tasks offline through the same local operation as every quick add.

#### Scenario: Start a project from the tool row
- **WHEN** the user has typed `Buy primer` in the phone's sheet and taps the project tool
- **THEN** the line reads `Buy primer #`, the field keeps focus with the keyboard up, and the project suggestions are open

#### Scenario: Chips for what is understood
- **WHEN** a project "Home renovation" exists and the user types `Call Mia about the tiles tomorrow 5pm #HomeRenovation`
- **THEN** the chip row shows a date chip reading tomorrow at 17:00 and a project chip "Home renovation", and a dashed "Label" placeholder

#### Scenario: Send offline
- **WHEN** the device is offline and the user taps send with `Water the plants`
- **THEN** the task appears at once in the current view with its defaults and syncs when the connection returns
