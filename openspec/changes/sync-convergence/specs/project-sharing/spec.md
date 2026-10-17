## ADDED Requirements

### Requirement: Confirmed history replay
A device that announces the `backfill_ack` feature SHALL receive each page of a joined project's history with a marker and SHALL echo it in its next exchange once it applied the page; the server SHALL advance that device's replay progress only on the echo, so a page that never arrived is served again. Devices that do not announce the feature SHALL keep the previous behaviour.

#### Scenario: Lost replay page
- **WHEN** Bob's device is served a page of a newly joined project's history and the response is lost
- **THEN** its next exchange, which echoes no marker, receives the same page again, and the replay completes with every operation of the project's history
