# Spec Delta

## ADDED Requirements

### Requirement: Both shells read a server address the same way
The Android and iOS shells SHALL turn an address typed on the first-run screen into the same result: the origin they open and whether it is plain `http`, the `https` address offered instead of plain `http` to a public host, or a refusal. Both SHALL send a host typed in Unicode in its ASCII (Punycode) form, and SHALL refuse a port outside 1 to 65535. The cases SHALL be kept in one fixture, `mobile/android/app/src/test/resources/server-address/cases.json`, which both shells' unit tests read, together with the hosts each counts as local. Reading an address touches no task data, so it has no offline or convergence behaviour of its own.

#### Scenario: A Unicode host on Android
- **WHEN** the user types `bücher.example` on the Android app's first-run screen
- **THEN** the app checks and opens `https://xn--bcher-kva.example`, as the iPhone app does

#### Scenario: A port out of range
- **WHEN** the user types `https://todo.example.com:99999` in either app
- **THEN** the address is refused as not an address

#### Scenario: A case added for one shell
- **WHEN** a contributor adds an address case to the fixture
- **THEN** both shells' unit tests check it, and a shell that reads it differently fails its own job
