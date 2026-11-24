## ADDED Requirements

### Requirement: Pressed feedback waits for a tap
On a touch device the pressed look of a control SHALL appear only after the finger has rested on it for 60 ms, SHALL NOT appear when the touch turns into a scroll within that time, and SHALL be shown only on the innermost interactive element under the finger, not on the rows or cards that contain it. Lifting the finger SHALL remove it at once. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: A scroll that starts on a row
- **WHEN** a person puts a finger on a task row and starts scrolling within 60 ms
- **THEN** the row never shows its pressed look

#### Scenario: A button inside a row
- **WHEN** a person presses the completion circle of a row and holds it for 100 ms
- **THEN** the circle shows its pressed look and the row does not
