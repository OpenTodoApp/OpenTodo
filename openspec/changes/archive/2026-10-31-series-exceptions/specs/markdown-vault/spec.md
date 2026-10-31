## ADDED Requirements

### Requirement: Single occurrences in files
An open occurrence record (OpenSpec `recurring-tasks`, "Occurrence records") SHALL be written as an ordinary task line of its project, without `🔁`, and ticking it SHALL complete that occurrence alone, leaving the series line unchanged. Done and skipped records SHALL NOT be added to a file; a ticked occurrence line stays as any ticked line does. Completing the series line SHALL move it to the next occurrence that is not an exception date, as the app does. A line edited in the file that changes a record's do-on date SHALL move that occurrence and never change its occurrence date.

#### Scenario: Moved session in the file
- **WHEN** Wednesday's "Study" occurrence was moved to Thursday in the app and the vault syncs
- **THEN** the project file holds the series line with its current do-on date and a separate line `- [ ] Study 📅 <Thursday> [time:: 18:00] 🆔 <record id>`

#### Scenario: Tick the series past an exception
- **WHEN** the series line `🔁 every day` with `📅 2026-10-12` is ticked and the 13th has a skipped record
- **THEN** after the sync the line reads `📅 2026-10-14`

#### Scenario: Tick a single occurrence
- **WHEN** the user ticks the line of Thursday's moved occurrence and syncs
- **THEN** that occurrence is done in the app, its line stays ticked, and the series line is unchanged
