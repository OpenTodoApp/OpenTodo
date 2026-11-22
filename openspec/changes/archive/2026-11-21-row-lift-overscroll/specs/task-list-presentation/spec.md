## ADDED Requirements

### Requirement: A row rises while it is held
On a touch device, a task row or sidebar row held for a long press SHALL visibly rise towards its dragged look before the drag starts, and SHALL settle back when the finger lifts early. Under reduced motion it SHALL only show the hold tint. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: An early release
- **WHEN** a person holds a row for 250 ms and lifts the finger
- **THEN** the row settles back and no drag starts
