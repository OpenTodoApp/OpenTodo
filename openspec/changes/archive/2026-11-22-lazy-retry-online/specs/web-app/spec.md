## ADDED Requirements

### Requirement: A part that failed to load offline recovers
When a lazily loaded part of the app fails to load because the device is offline, the part SHALL show the "could not be shown" message and SHALL render itself again, without a reload, once the device is back online. Other failures SHALL keep the message and the Reload button. It changes no data, so offline behaviour of local data and convergence are unaffected.

#### Scenario: Connection lost while a screen loads
- **WHEN** a person on a new device opens a project and the connection drops before its panels have loaded
- **THEN** the panels show the message, and once the connection is back they render without a reload

#### Scenario: Another error
- **WHEN** a part fails to render for another reason
- **THEN** it keeps the message and the Reload button
