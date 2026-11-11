## ADDED Requirements

### Requirement: News entries stay English, and the page says so
What's new entries SHALL be the English text shipped with the version. The card's own chrome (its name, the version-notices switch, the disclosure, the empty line) SHALL follow the active language. When the active language is not English and there is at least one entry, the card SHALL start with a short note in the active language that the notes are in English.

#### Scenario: News in French
- **WHEN** the language is French and the user opens What's new on a client that has an entry
- **THEN** the note at the top of the card is French, the switch and the disclosure are French, and the entry body is the English text

#### Scenario: English has no note
- **WHEN** the language is English and the user opens What's new
- **THEN** no "these notes are in English" line is shown
