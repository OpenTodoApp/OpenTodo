# daily-notes Specification

## Purpose
Daily notes are one standalone note per day and user, the same on every device: the setting with its project and template, the name-based note and its server check, opening today's note and moving between days without writing, and the template written once.

## Requirements

### Requirement: Daily notes setting
Each user SHALL have the preferences Daily notes (off by default), a project for daily notes (none by default) and a template for them (the built-in Daily by default, one of the user's note templates, or none), in Settings › Notes, stored as additive fields of the user's preferences row, written as operations applied locally first and converging by last-writer-wins like the other preferences. A device SHALL read a template id it cannot resolve as the built-in Daily and keep the stored value. While the setting is off, every entry of "Opening a daily note" SHALL be hidden and existing daily notes SHALL stay ordinary notes.

#### Scenario: Turn on offline
- **WHEN** the device is offline and the user turns on Daily notes with the project Journal
- **THEN** the entries appear at once on this device, and on the user's other devices after sync

#### Scenario: Template removed
- **WHEN** the template chosen for daily notes is moved to the Trash
- **THEN** the next daily note is created from the built-in Daily, and the setting still names the trashed template

### Requirement: One note per day
A daily note SHALL be a standalone note with an additive field `day` (`YYYY-MM-DD`) and the name-based id derived from the user's id and the day, so every device of the user that creates the note of a day creates the same note. It SHALL be created with the day's date in the user's date format as its title, the setting's project, the template's labels, and the filled template written as the note's plain-text text only, from which the document is built once by the fold-back of plain-text writes, named after the day and the text rather than the write's clock, whether a device or the routine step creates the note, so every creator builds the same document. The server SHALL refuse, changing nothing, an operation that sets `day` on a note whose id is not the name-based id of the operation's author and that day. `day` SHALL never change after creation. Creating the note of a day whose note is in the Trash SHALL restore it.

#### Scenario: Two devices offline
- **WHEN** the laptop and the phone are both offline on 2026-11-12, the user writes "Call the bank" in today's note on the laptop and "Ferry at 9" on the phone, and both sync
- **THEN** every device has one note for 2026-11-12, with the template's text once and both lines

#### Scenario: Forged day
- **WHEN** a client sends an operation setting `day` to 2026-11-12 on a note with a random id
- **THEN** the server refuses it as invalid and the note is unchanged on every device

#### Scenario: Deleted and opened again
- **WHEN** the user moves the note of 2026-11-10 to the Trash and then opens that day and types
- **THEN** the note comes back from the Trash with the new text, and there is still one note for that day

### Requirement: Opening a daily note
While Daily notes is on, `g j`, "Open today's note" in the command palette, a Today's note row under All notes in the Notes sidebar and an icon button in Today's header SHALL open the note of today, where today is the user's date after the day start. A day without a note SHALL open as a draft showing the filled template; the note SHALL be written only at the first change the user makes (typing, pasting, ticking, formatting), and a draft left unchanged SHALL write nothing. In a daily note, ‹ and › in its header, and `[` and `]` while no text field has focus, SHALL open the previous and next day. It SHALL all work offline.

#### Scenario: Browse without writing
- **WHEN** the user presses `g j`, then `[` three times, then closes the note without typing
- **THEN** no note was created, and nothing is sent on the next sync

#### Scenario: Day start
- **WHEN** a user whose day starts at 04:00 presses `g j` at 01:30 on 2026-11-13
- **THEN** the note of 2026-11-12 opens

#### Scenario: First keystroke
- **WHEN** the user opens today's draft offline and types "Slept badly"
- **THEN** today's note is created with the template's text and the line, it is listed on the Notes page, and it reaches the other devices on the next sync

#### Scenario: Setting off
- **WHEN** Daily notes is off
- **THEN** `g j` does nothing, the palette offers no "Open today's note", and neither the Notes sidebar nor Today shows the entry
