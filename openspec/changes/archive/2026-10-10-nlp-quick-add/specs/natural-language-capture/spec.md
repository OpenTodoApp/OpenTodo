# Spec Delta

## Purpose

Defines how a single quick-add line is parsed into task attributes: the token grammar, date and time resolution, multi-language vocabulary, the live preview, how the user overrides the parser, and the guarantee that parsing is deterministic and works offline.

## ADDED Requirements

### Requirement: Attribute tokens
The quick-add line SHALL recognise `#<name>` as a project reference, `@<name>` as a label, `p1`–`p4` as a priority (1 highest, 4 lowest) and `+<duration>` (`+30m`, `+2h`, `+1h30`) as a duration estimate in minutes. A `#` token SHALL match a non-archived, non-deleted project by case-insensitive name, exact match first and unique prefix second; a token that matches no project SHALL stay in the title unchanged. Recognised tokens SHALL be removed from the title and surrounding whitespace collapsed.

#### Scenario: Full line
- **WHEN** the user enters `Meeting with Sarah #work @call p1 +30m` and a project named "Work" exists
- **THEN** the created task has title `Meeting with Sarah`, project "Work", labels `["call"]`, priority 1 and estimate 30 minutes

#### Scenario: Unknown project token stays literal
- **WHEN** the user enters `Read #ambiguous` and no project name starts with "ambiguous"
- **THEN** the title is `Read #ambiguous` and the task goes to the context's default project

#### Scenario: Ambiguous prefix is not guessed
- **WHEN** projects "Home" and "Homework" exist and the user enters `Fix sink #hom`
- **THEN** the token is not resolved, the title keeps `#hom`, and the preview shows no project chip

### Requirement: Date and time phrases
The parser SHALL recognise relative day words, weekday names with an optional "next", "in N days/weeks/months", "next week/month", month-and-day and numeric dates, and 12-hour or 24-hour times optionally preceded by "at". Dates SHALL resolve against the viewer's local date, always to today or later, and a time without a date SHALL mean today. The result SHALL be stored as the floating `{date: "YYYY-MM-DD", time?: "HH:MM"}` due value.

#### Scenario: Next weekday with time
- **WHEN** today is Friday 2026-10-09 and the user enters `Dentist next Wed at 3pm`
- **THEN** the task is due `{date: "2026-10-14", time: "15:00"}` and its title is `Dentist`

#### Scenario: Time only
- **WHEN** the user enters `Call back 16:30` with no date phrase
- **THEN** the task is due today at `16:30`

#### Scenario: Date in the past rolls forward
- **WHEN** today is 2026-10-09 and the user enters `Renew passport 3 Feb`
- **THEN** the task is due `2027-02-03`

### Requirement: Multi-language vocabulary
Date and time vocabulary SHALL be bundled for English, German, French, Italian, Spanish and Portuguese and SHALL be available with no network. The active set SHALL be the browser's preferred languages that are bundled, with English always active, and SHALL be overridable in Settings. Attribute tokens (`#`, `@`, `p1`–`p4`, `+`) SHALL be language-independent.

#### Scenario: German phrase
- **WHEN** the browser language is `de` and the user enters `Zahnarzt nächsten Mittwoch um 15 Uhr`
- **THEN** the task is due next Wednesday at `15:00` with title `Zahnarzt`

#### Scenario: English always works
- **WHEN** the browser language is `it` and the user enters `Pay rent tomorrow`
- **THEN** the task is due tomorrow with title `Pay rent`

#### Scenario: Unsupported language falls back
- **WHEN** the browser language is one with no bundled vocabulary
- **THEN** English vocabulary is active, attribute tokens still work, and no error is shown

### Requirement: Live preview chips
While the user types, the client SHALL show one chip per recognised attribute (due, project, label, priority, estimate) below the input and the title as it will be saved. The preview SHALL update on every keystroke without noticeable delay and SHALL be announced to assistive technology without stealing focus.

#### Scenario: Chips appear as tokens are typed
- **WHEN** the user has typed `Buy milk tomorrow p2`
- **THEN** a due chip reading tomorrow's date and a priority chip reading `P2` are shown, and the title preview reads `Buy milk`

#### Scenario: Chips disappear when text changes
- **WHEN** the user deletes `p2` from the line
- **THEN** the priority chip disappears and the task would be created with priority 4

### Requirement: Dismiss and escape parsed tokens
The user SHALL be able to reject an interpretation: activating a chip's dismiss control, or pressing Backspace when the caret is at the end of the line and the last chip is highlighted, SHALL keep that text literally in the title and SHALL suppress re-parsing of that span until the span's text changes. Text inside double quotes SHALL never be parsed, and the quotes SHALL be removed from the saved title.

#### Scenario: Dismiss a false positive
- **WHEN** the user types `Review "may" report`, or types `Review may report` and dismisses the due chip for May
- **THEN** the title is `Review may report` and the task has no due date

#### Scenario: Dismissal survives further typing
- **WHEN** the user dismissed the due chip for `may` and keeps typing `... with Ana`
- **THEN** no due chip reappears for `may`

#### Scenario: Keyboard dismissal
- **WHEN** the caret is at the end of the line and the user presses Backspace twice
- **THEN** the first press highlights the last chip and the second press dismisses it, leaving the text unchanged

### Requirement: Deterministic and offline parsing
Parsing SHALL be a pure function of the line, the reference date and time, the active languages and the project list, with no network access and no randomness, so the same input yields the same result on every device. The created task SHALL be written as one local operation set that is visible immediately, syncs when a connection exists, and converges under the per-field last-writer-wins rule like any other edit.

#### Scenario: Offline capture
- **WHEN** the device is offline and the user enters `Water plants tomorrow #home`
- **THEN** the task is created locally with the parsed date and project, and uploads when the device reconnects

#### Scenario: Same result on every device
- **WHEN** the same line is parsed on two devices with the same local date, languages and projects
- **THEN** both produce identical title, due, project, labels, priority and estimate

### Requirement: Per-device parsing toggle
Settings SHALL offer a switch that turns natural-language parsing off for the current device. With parsing off, quick add SHALL behave as a plain title field and SHALL show no chips. The setting SHALL be stored only on the device and SHALL not sync.

#### Scenario: Parsing off
- **WHEN** parsing is switched off and the user enters `Buy milk tomorrow p2`
- **THEN** a task titled `Buy milk tomorrow p2` is created with priority 4 and the view's default due date
