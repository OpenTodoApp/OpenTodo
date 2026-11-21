## ADDED Requirements

### Requirement: Page changes move with a direction
When a person opens a deeper page, the new page SHALL slide in from the end edge; going back SHALL slide it out the same way; switching between top-level destinations SHALL cross-fade. The sidebar, bottom bar and header chrome SHALL stay in place. With reduced motion, the no-motion display setting, a focused text field or a hidden tab, the page SHALL change at once. Navigation SHALL never wait for an animation to finish before it accepts the next input. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: Into a task and back
- **WHEN** a person on a phone opens a task page from the Inbox and then goes back
- **THEN** the task page slides in from the end edge and slides out the same way, and the bottom bar does not move

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion
- **THEN** pages change at once
