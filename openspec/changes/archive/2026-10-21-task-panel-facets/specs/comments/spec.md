# Spec Delta

## MODIFIED Requirements

### Requirement: Composer behaviour
The composer SHALL rest as a single line and expand when focused, when it holds a draft or a reply target, or when its shortcut is pressed; expanded, it SHALL grow with its content up to a limit, keep @-mention completion, show the submit key combination, keep an unsent draft per task on the device while the panel is closed, and show the reply target with a way to cancel it when replying.

#### Scenario: Draft survives closing the panel
- **WHEN** the user types a comment, closes the panel without sending and reopens the task on the same device
- **THEN** the draft is still in the expanded composer, and it is not visible on other devices

#### Scenario: Cancel a reply
- **WHEN** the user chooses Reply on a comment and then cancels the reply target
- **THEN** the composer posts a new top-level comment instead

#### Scenario: Collapses when left empty
- **WHEN** the user focuses the composer, types nothing and moves focus elsewhere
- **THEN** the composer returns to its single resting line
