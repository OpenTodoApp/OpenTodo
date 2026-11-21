## ADDED Requirements

### Requirement: No native overscroll effect on Android
The Android shell SHALL NOT draw the platform's overscroll glow or stretch over the page; the page's own scrolling decides what happens at an edge. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: The end of a list
- **WHEN** a person flings to the end of a long list in the Android app
- **THEN** no glow or stretch appears
