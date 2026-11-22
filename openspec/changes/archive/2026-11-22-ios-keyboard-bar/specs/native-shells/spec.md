## ADDED Requirements

### Requirement: No keyboard accessory bar in the iOS app
The iOS shell SHALL NOT show the web view's keyboard accessory bar above the on-screen keyboard. If the platform changes so it cannot be removed, the app SHALL keep working with the bar. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: Editing a title in the iPhone app
- **WHEN** a person taps a task title to edit it in the iPhone app
- **THEN** the keyboard opens without the previous, next and Done bar
