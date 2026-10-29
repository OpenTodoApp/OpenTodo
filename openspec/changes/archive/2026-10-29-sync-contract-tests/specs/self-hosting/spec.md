## ADDED Requirements

### Requirement: The sync client is tested against the server
CI SHALL run the web app's sync client code, unmocked, against the server binary built in the same run, with several simulated devices that each have their own local database and session. The tests SHALL cover at least convergence of two devices of one account, offline edits on two devices converging on the later edit on every device and the server, a device clock far ahead being refused and corrected without losing the change, a refused edit of a viewer being reported and undone on the device, and a device's offline queue reaching the server after reconnecting.

#### Scenario: The server changes a refusal reason
- **WHEN** a change renames the `clock_skew` refusal on the server without changing the client
- **THEN** the contract test of a fast device clock fails in CI

#### Scenario: The client stops undoing refused edits
- **WHEN** a change keeps a viewer's refused edit on the device
- **THEN** the contract test of the viewer fails because the device still shows the refused value

#### Scenario: Unit tests stay offline
- **WHEN** a contributor runs `npm test` without a server binary
- **THEN** the contract tests are not run, and `npm run test:contract` names the missing binary
