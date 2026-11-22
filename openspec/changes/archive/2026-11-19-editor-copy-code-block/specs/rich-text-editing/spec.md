# Spec Delta

## MODIFIED Requirements

### Requirement: Copying a code block
Every fenced code block SHALL have a Copy button in its top end corner, on every surface that shows one: rendered notes, comments, answers and public pages, and the rich-text editor where notes and comments are written. Activating it SHALL put the block's text on the clipboard as plain text, without the fence lines, with its own indentation and with no trailing newline, and SHALL announce that it was copied, or that it could not be copied when the browser refuses the clipboard. The button SHALL behave the same in the editor as in rendered text: activating it SHALL NOT move the caret or change the selection, and SHALL NOT write to the note. A note the reader may not edit SHALL also offer a **Copy note** action, reachable with the keyboard, that copies the note's Markdown. Nothing about either is stored or synced.

#### Scenario: Copy a command
- **WHEN** a note shows a code block containing `docker compose up -d` and the user activates its Copy button
- **THEN** the clipboard holds `docker compose up -d` and the button announces "Copied"

#### Scenario: Copy a command while editing the note
- **WHEN** the task page shows the notes in the editor, the caret is in the title's paragraph, and the user activates the Copy button of a code block in the notes
- **THEN** the clipboard holds the block's text without its fences or trailing newline, the button announces "Copied", and the caret is still in the paragraph it was in

#### Scenario: The editor and the rendered text agree
- **WHEN** the same fenced block is copied once in the editor and once in a comment that renders it
- **THEN** the clipboard holds the same text both times

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
