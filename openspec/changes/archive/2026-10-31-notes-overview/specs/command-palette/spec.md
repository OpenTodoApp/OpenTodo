## ADDED Requirements

### Requirement: Notes in search
The palette SHALL find standalone notes by title and text and project notes by text, in a Notes section, each with a snippet of the text around the first match as its second line, and a task found by its notes SHALL show the same snippet. Matching SHALL be the Notes page's (every word, ignoring case and accents), from the device's local data only, over the decrypted copy on an encrypted account, offline included, sending nothing to the server. Deleted notes SHALL never be listed. Picking a note SHALL open it as the Notes page does, and the palette SHALL offer the commands "Go to Notes" (`g` then `e`) and "New note".

#### Scenario: Find a standalone note
- **WHEN** the note "Trip" contains "ferry" and the user presses Ctrl+K and types `ferry`
- **THEN** "Trip" is listed under Notes with the snippet, and Enter opens the note

#### Scenario: Project note
- **WHEN** the project "Renovation" has a note mentioning "permit" and the user types `permit`
- **THEN** "Renovation" is listed under Notes as a project note, and Enter opens the project with its note

#### Scenario: Encrypted and offline
- **WHEN** an encrypted account is unlocked on an offline device and the user types a word from a note's body
- **THEN** the note is listed from the decrypted local copy and no request is made

#### Scenario: Go to Notes
- **WHEN** the user types `notes` in the palette
- **THEN** "Go to Notes" is listed with `g e`, and Enter opens the Notes page
