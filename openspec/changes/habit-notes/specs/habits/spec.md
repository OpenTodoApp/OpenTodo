## ADDED Requirements

### Requirement: The habit's note
A habit's own note SHALL be its task note, shown first on the habit's page while Habits is on, written, linked, searched and synced exactly as any task note, offline included. An occurrence record of a habit SHALL not copy the habit's note when it is written, on any device or on the server, so a day's note starts empty; records written before this change keep what they hold.

#### Scenario: Why I run
- **WHEN** the user writes "Training for the 10k in March" in Run's note
- **THEN** it shows at the top of Run's page and in note search, and no occurrence record of Run holds that text

#### Scenario: Completed on the server
- **WHEN** a script completes Run through the API
- **THEN** the record written by the server has an empty note

### Requirement: Check-in notes
While Habits is on, checking in a habit from the Habits screen, the Today strip or its page SHALL open a single "How did it go?" line in place, without moving focus from the list for keyboard users until they press Tab; typing and pressing Enter SHALL save the text as the note of that day's occurrence record, and Escape, or leaving it, SHALL write nothing. A past day in the thread or the month grid SHALL offer **Note** to add or change that day's note; for a day without a record it SHALL first ask for its state. A check-in note SHALL be ordinary task note content: formatted, able to hold `[[` links, found by note search with the habit's title and the date, encrypted on an end-to-end encrypted account, editable offline and converging as task notes do. Logging a check-in through the API, CLI or MCP SHALL write no note unless one is given.

#### Scenario: A line after the run
- **WHEN** the user checks in Run and types "5k, knee a bit sore" and presses Enter
- **THEN** today's record of Run holds that note, the day shows a note mark, and one Undo removes the note and keeps the check-in

#### Scenario: Nothing to say
- **WHEN** the user checks in Read and presses Escape on the line
- **THEN** only the check-in is written

#### Scenario: A note for yesterday
- **WHEN** the user chooses Note on yesterday's done day of Run and writes "Easy pace"
- **THEN** yesterday's record holds the note and the streak is unchanged

#### Scenario: Two devices
- **WHEN** two offline devices each add a note to the same day's record and both sync
- **THEN** every device shows the same note, merged as concurrent edits of one task note merge

### Requirement: Check-ins on the habit's page
A habit's page SHALL list its records that have a note under **Check-ins**, newest first, each with its date, its state (done, tiny or skipped) and the note, paged by 20, rendered from the device's rows, offline too. Each entry SHALL open that day's note for editing. Days with a note SHALL show a small mark in the thread and the month grid, announced as part of the day ("Monday 9 November, done, with a note").

#### Scenario: A month of runs
- **WHEN** Run has 12 records with a note in October
- **THEN** the page lists them newest first and the grid marks those 12 days

#### Scenario: Screen reader
- **WHEN** a screen reader user reaches a day with a note in the grid
- **THEN** it is announced with its date, its state and "with a note"
