## ADDED Requirements

### Requirement: The focused field stays above the keyboard
When the on-screen keyboard opens or changes height, the focused field SHALL be scrolled inside its own scroller so that its bottom edge is at least 12 px above the keyboard, without scrolling the document behind a sheet or panel. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: The last field of a sheet
- **WHEN** a person taps the note field at the bottom of the task sheet on a phone
- **THEN** the sheet scrolls so the field sits above the keyboard and the page behind does not move
