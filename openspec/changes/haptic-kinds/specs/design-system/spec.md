## ADDED Requirements

### Requirement: Haptics for switches, segments, failures and lifts
With haptics on, a switch flipped by touch and a segment chosen by touch SHALL play `selection`, a failure toast SHALL play `error`, and lifting a row to drag it SHALL play `tick`. Keyboard changes and changes made by the app itself SHALL NOT play anything. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: A switch by keyboard
- **WHEN** a person flips the "Show full task titles" switch with Space on a hardware keyboard
- **THEN** no haptic plays
