## MODIFIED Requirements

### Requirement: Rich-text notes editor
The task page (and the docked panel) SHALL edit notes as rich text supporting paragraphs, headings, bold, italic, strikethrough, inline code, links, bullet, numbered and check lists, block quotes, code blocks, tables, images from the task's attachments and mentions of members. Every formatting action SHALL be reachable from the keyboard and from a slash command menu, Markdown-style input rules SHALL apply formatting while typing, and the editor's keys SHALL be listed in the keyboard cheat sheet's editing section. Edits SHALL apply locally and offline immediately and SHALL be recorded as operations, converging with other devices under the document merge rules of this capability. The same editor SHALL be used wherever this app edits rich text (project notes, the comment composer), so a feature works the same in every place it is offered.

#### Scenario: Format with the keyboard
- **WHEN** the user selects text in the notes and presses the bold shortcut, or types `- ` at the start of a line
- **THEN** the selection becomes bold, or the line becomes a bullet item, with no mouse interaction

#### Scenario: Edit offline
- **WHEN** the device is offline and the user edits a note
- **THEN** the change is visible immediately, survives a reload, and is uploaded on the next successful sync

#### Scenario: Checklist item toggled
- **WHEN** the user toggles a check-list item in the notes
- **THEN** its checked state is saved as part of the note and shows the same on every device after sync

#### Scenario: Quote and code block
- **WHEN** the user types `> ` at the start of a line, or ```` ``` ```` and Enter
- **THEN** the line becomes a block quote, or a code block that keeps text verbatim without input rules, and the projection shows `> ` and a fenced block
