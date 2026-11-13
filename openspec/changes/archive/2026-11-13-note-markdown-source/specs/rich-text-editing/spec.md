## ADDED Requirements

### Requirement: Markdown source mode
Every note the user may edit (task notes on the task page and in the docked panel, project notes and standalone notes) SHALL offer a Markdown source mode that shows the note's plain-text projection as editable monospace text in the note's place, reached with `Ctrl+Shift+M` (`⌘+Shift+M` on a Mac) while the note has focus, with a **Markdown** entry in the slash menu, and on a fine pointer with a **Markdown** button beside the Formatting toggle, revealed with it and announced with its pressed state. The same key or button SHALL return to rich text with the caret in the block that held it. The mode SHALL last until the note is closed and SHALL not be stored or synced. A read-only note SHALL show its source read-only. The shortcut SHALL be registered in the keyboard registry's editing section without a conflict.

#### Scenario: Open the source
- **WHEN** the user presses `Ctrl+Shift+M` in a note holding a heading "Plan" and a check list
- **THEN** the note shows `# Plan` and `- [ ] ` lines as plain text, and pressing `Ctrl+Shift+M` again shows the heading and the check list as rich text

#### Scenario: Fix a list
- **WHEN** in source mode the user changes `1. milk` to `- milk` and returns to rich text
- **THEN** the line is a bullet item, on every device after sync

#### Scenario: Viewer
- **WHEN** a viewer of a shared project switches a project note to its source
- **THEN** the source is shown and cannot be edited

#### Scenario: Not remembered
- **WHEN** the user closes a note in source mode and opens it again
- **THEN** it opens as rich text

### Requirement: Source edits apply block by block
Edits made in source mode SHALL be applied to the note's document at each local save pause and on leaving the mode by replacing, inserting or deleting only the top-level blocks whose text differs from the projection, so unchanged blocks keep their nodes (mentions, images from attachments, tables) and the projection is written in the same batch. Each application SHALL be an ordinary document edit: it SHALL apply locally and offline at once, survive a reload, and converge with concurrent edits from other devices under "Concurrent note edits converge without loss". Remote edits arriving while the source is shown SHALL update the source text in the blocks the user has not changed since the last pause without moving the caret or selection.

#### Scenario: Concurrent edit kept
- **WHEN** device A edits the second paragraph of a note in source mode while device B, online, adds a fourth paragraph, and device A returns to rich text
- **THEN** every device shows A's change to the second paragraph and B's fourth paragraph

#### Scenario: Untouched mention kept
- **WHEN** a task note holds a paragraph with a mention of Anna and the user changes only another paragraph in source mode
- **THEN** the mention is still a mention after leaving source mode

#### Scenario: Remote edit while typing
- **WHEN** the user types in the first paragraph in source mode and another device changes the last paragraph
- **THEN** the source shows the new last paragraph and the caret stays where the user was typing

#### Scenario: Offline
- **WHEN** the device is offline and the user edits a note in source mode and reloads
- **THEN** the edit is shown and is uploaded on the next successful sync
