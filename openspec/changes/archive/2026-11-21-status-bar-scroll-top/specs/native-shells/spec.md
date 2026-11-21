## ADDED Requirements

### Requirement: A status bar tap reaches the page
The iOS shell SHALL deliver a tap on the status bar to the page as a scroll-to-top event and SHALL list the `scroll-top` capability. The web view itself SHALL NOT scroll in response. Shells without the capability SHALL behave as before. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: A tap on the status bar in the iPhone app
- **WHEN** a person scrolled far down the Inbox in the iPhone app and taps the status bar
- **THEN** the page receives one scroll-to-top event and the web view does not move
