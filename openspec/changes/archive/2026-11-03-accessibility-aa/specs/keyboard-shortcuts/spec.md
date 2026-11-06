## ADDED Requirements

### Requirement: Single-key shortcuts can be turned off
The client SHALL offer a per-device switch "Single-key shortcuts" in Settings → General → Keyboard, on by default. While it is off, no shortcut whose first key is a single letter, number, punctuation or symbol character pressed without Ctrl, Alt or ⌘ SHALL run, including the sequences that start with one (`g` then a key); shortcuts with Ctrl, Alt or ⌘ and the named keys (arrows, Enter, Escape, Tab, Delete, the function keys, Space) SHALL keep working, and typing in a text field is unaffected either way (WCAG 2.2 2.1.4 Character Key Shortcuts).

#### Scenario: Speech input does not run commands
- **WHEN** a person who uses speech input turns Single-key shortcuts off and says "quick" while the Today list has focus
- **THEN** no quick add opens and nothing else runs, and Ctrl+K still opens search

#### Scenario: On by default
- **WHEN** a new device opens the app
- **THEN** pressing `q` opens the quick add
