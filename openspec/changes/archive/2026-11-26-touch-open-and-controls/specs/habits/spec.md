# Spec Delta

## ADDED Requirements

### Requirement: Check-in controls are visible by touch
On a device whose main pointer is coarse, the control of a habit's row that opens the other ways to check in, and the control of a check-in on the habit's page that edits its note, SHALL be visible without a hover or a focus. With a fine pointer they SHALL appear on hover and on focus, as before. What they do does not change.

#### Scenario: The menu of a habit's row on a phone
- **WHEN** the Habits screen is open on a touch phone
- **THEN** each row that offers other ways to check in shows the control that opens them

#### Scenario: A mouse
- **WHEN** the same screen is open with a mouse and no row is hovered or focused
- **THEN** the control is not drawn
