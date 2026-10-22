# Spec Delta

## ADDED Requirements

### Requirement: Ask from the command bar
When the assistant is available to the user, the command bar's Ask mode SHALL hand its text to the assistant panel as one turn on Enter, through the same path as the Ask composer, and SHALL be absent when the assistant is unavailable; no composer, hint or Ask segment SHALL be shown to a user without the assistant.

#### Scenario: Member without the assistant
- **WHEN** the owner has not enabled the assistant and a member opens the command bar
- **THEN** the segmented control shows Search, Add and Commands only, and `?` is ordinary text

#### Scenario: Ask hands over one turn
- **WHEN** a user with consent recorded types `?plan my afternoon` in the bar and presses Enter
- **THEN** the assistant panel opens, "plan my afternoon" is sent as one turn, and the token usage is counted as for a turn from the panel
