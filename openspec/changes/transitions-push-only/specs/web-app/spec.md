## MODIFIED Requirements

### Requirement: Page changes move with a direction
When a person opens a task's page, Settings, or a section or page of Settings, the new page SHALL slide in from the end edge; going back from one SHALL slide it out the same way. A change between two list views (the Inbox, Today, Upcoming, a project, a label, a place, a saved view, the Notes pages, Rules) SHALL change the page at once, without a transition, so the new list is never shown later for an animation. The sidebar, bottom bar and header chrome SHALL stay in place. With reduced motion, the no-motion display setting, a focused text field, a hidden tab or a change made from the keyboard, the page SHALL change at once, so keys typed straight after a shortcut reach the new page. Navigation SHALL never wait for an animation to finish before it accepts the next input. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: Into a task and back
- **WHEN** a person on a phone opens a task page from the Inbox and then goes back
- **THEN** the task page slides in from the end edge and slides out the same way, and the bottom bar does not move

#### Scenario: Between list views
- **WHEN** a person taps a saved view, then a project, then goes back through the history to the saved view
- **THEN** each list replaces the last at once, with no transition

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion
- **THEN** pages change at once

#### Scenario: Keys straight after a shortcut
- **WHEN** a person closes a task page with Escape and at once presses j and c
- **THEN** the list is back before the keys arrive, and they move to and complete a task in it
