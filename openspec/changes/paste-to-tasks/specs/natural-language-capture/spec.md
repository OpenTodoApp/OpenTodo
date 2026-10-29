# Spec Delta

## ADDED Requirements

### Requirement: Pasting several lines into quick add
When text with at least two non-empty lines is pasted into an empty quick add (or one whose whole text is selected), in any of its presentations (a list's or a section's quick add, the command bar, the phone's add sheet, the share capture screen, a calendar day's add dialog), the paste SHALL NOT be inserted; instead an offer anchored to the field SHALL show the number of tasks, the first five lines as they will be titled and how many more follow, with "Add N tasks" (the default, Enter) and "Paste as one line" (inserts the lines joined by spaces); Escape SHALL close the offer and paste nothing. A paste into a field that already holds unselected text, or of a single line, SHALL behave as before.

Before counting, each line SHALL be trimmed, blank lines SHALL be skipped, one leading list marker (`-`, `*`, `+`, `•`, `‣`, `◦`, a number or letter followed by `.` or `)`, `[ ]`, `[x]`, `- [ ]`, `- [x]`, `☐`, `☑`) SHALL be removed, and runs of whitespace SHALL become one space; a line holding only a marker SHALL be skipped. A checked box SHALL NOT complete the task.

Confirming SHALL create one task per line, in the pasted order. With parsing on, each line SHALL be parsed on its own with the same options as a typed line, and the view's defaults SHALL fill what the line does not set, exactly as if each line had been typed and added; a line whose parse leaves an empty title SHALL keep its cleaned text as the title. All tasks of one paste, with the reminders their lines ask for, SHALL be written as one batch of operations, applied locally first, so the paste works offline, is uploaded together and converges like tasks created one by one; one Undo SHALL remove them all. A paste of more than 100 lines SHALL NOT be split: the offer SHALL say so and offer Import and "Paste as one line". If any line cannot be written (for example, too long to encrypt), no task of the paste SHALL be created and the field SHALL show why.

#### Scenario: Paste a shopping list into the Inbox
- **WHEN** the user pastes "- Milk\n- Eggs\n\n- Bread" into the empty Inbox quick add and presses Enter on the offer
- **THEN** the Inbox gains the tasks "Milk", "Eggs" and "Bread" in that order, and a toast says "3 tasks added" with Undo

#### Scenario: Each line is parsed with the view's defaults
- **WHEN** parsing is on and the user pastes "Call Anna tomorrow 10am\nSend invoice #Work p1" into Today's quick add and confirms
- **THEN** "Call Anna" is due tomorrow at 10:00, and "Send invoice" is due today in project Work with priority 1

#### Scenario: Paste as one line
- **WHEN** the user pastes two lines and chooses "Paste as one line"
- **THEN** the field holds both lines joined by a space and nothing is created until the user adds it

#### Scenario: Escape pastes nothing
- **WHEN** the offer is open and the user presses Escape
- **THEN** the offer closes, the field is still empty and nothing is created

#### Scenario: Field already has text
- **WHEN** the field holds "Buy " with the caret at its end and the user pastes two lines
- **THEN** no offer appears and the paste is inserted into the field as the browser does

#### Scenario: Offline paste
- **WHEN** the device is offline and the user pastes and confirms five lines
- **THEN** the five tasks appear at once, survive a reload, and are uploaded together on the next successful sync

#### Scenario: One Undo
- **WHEN** the user pastes and confirms five lines and then chooses Undo in the toast
- **THEN** all five tasks are removed in one step and none of them reaches other devices as an open task

#### Scenario: Too many lines
- **WHEN** the user pastes 150 lines
- **THEN** the offer says that more than 100 lines cannot be added at once, offers Import and "Paste as one line", and creates nothing

#### Scenario: Encrypted account with a line too long
- **WHEN** an encrypted account pastes three lines and one is longer than an encrypted title can hold
- **THEN** no task is created and the field says that the title is too long to encrypt
