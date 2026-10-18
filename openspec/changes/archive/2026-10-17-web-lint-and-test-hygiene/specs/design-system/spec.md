## ADDED Requirements

### Requirement: Hooks lint gate
The web app's checks SHALL lint its source for the Rules of Hooks and for effect, memo and callback dependencies, and SHALL fail on any finding. A suppression of either rule SHALL state its reason, and a suppression that no longer suppresses anything SHALL fail the check. The gate is a development check only and adds nothing to the shipped app.

#### Scenario: Missing effect dependency fails the check
- **WHEN** a change adds an effect that reads a prop not listed in its dependencies
- **THEN** the hooks lint fails and names the file, the line and the missing dependency

#### Scenario: Stale suppression fails the check
- **WHEN** a dependency suppression remains on an effect whose dependencies are now complete
- **THEN** the hooks lint fails on the unused suppression

#### Scenario: Justified suppression passes
- **WHEN** a mount-only effect carries a dependency suppression followed by its reason
- **THEN** the hooks lint passes

### Requirement: Hermetic web tests
The web test suite SHALL NOT reach the network: a request a test did not mock SHALL fail that test and name the request. Interaction tests SHALL wait for the condition they assert, with a deadline, rather than for a fixed time, so that a busy machine running tests in parallel only makes them slower, never failing.

#### Scenario: Unmocked request
- **WHEN** a test renders a screen that asks the server for data and the test mocks no request
- **THEN** the test fails with a message naming the method and path of the request

#### Scenario: Busy machine
- **WHEN** the full web suite runs with more parallel workers than processor cores
- **THEN** every test passes as it does on an idle machine
