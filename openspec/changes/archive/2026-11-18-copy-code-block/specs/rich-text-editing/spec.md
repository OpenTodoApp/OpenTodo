## ADDED Requirements

### Requirement: Copying a code block
Every fenced code block shown as formatted text SHALL have a Copy button in its top end corner, on every surface that renders notes, comments or answers as text, for every reader including viewers of a shared project. Activating it SHALL put the block's text on the clipboard as plain text, without the fence lines, with its own indentation and with no trailing newline, and SHALL announce that it was copied, or that it could not be copied when the browser refuses the clipboard. A note the reader may not edit SHALL also offer a **Copy note** action, reachable with the keyboard, that copies the note's Markdown. Nothing about either is stored or synced.

#### Scenario: Copy a command
- **WHEN** a note shows a code block containing `docker compose up -d` and the user activates its Copy button
- **THEN** the clipboard holds `docker compose up -d` and the button announces "Copied"

#### Scenario: Indentation is kept
- **WHEN** a code block holds a Python snippet whose body lines are indented
- **THEN** the copied text keeps the indentation of every line

#### Scenario: A viewer copies
- **WHEN** a viewer of a shared project opens a note whose text holds a code block
- **THEN** the code block shows its Copy button and the viewer can copy it

#### Scenario: Copy a whole note from the keyboard
- **WHEN** a viewer of a shared project moves through the note's controls with the Tab key and activates **Copy note**
- **THEN** the clipboard holds the note's Markdown and the action announces that it was copied

#### Scenario: Clipboard refused
- **WHEN** the browser refuses both the Clipboard API and the fallback
- **THEN** the button announces that it could not copy, and the text stays on screen to select
