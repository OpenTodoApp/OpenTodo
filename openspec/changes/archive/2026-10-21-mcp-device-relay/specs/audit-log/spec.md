## ADDED Requirements

### Requirement: Device relay events
The server SHALL record `relay.enabled` and `relay.disabled` with the acting account, the device id and the device's label, in the transaction of the change; `relay.disabled` SHALL also name the reason (`user`, `locked`, `signed_out`, `encryption_off`). Relayed calls SHALL NOT be recorded as relay events; relayed writes are recorded as `agent.write` like every assistant write, with counts only. No relayed value, tool argument or result SHALL ever appear in the log.

#### Scenario: Turned on
- **WHEN** a user opts in their laptop to answer AI connectors
- **THEN** the log contains `relay.enabled` with the user as actor and the laptop's device id and label

#### Scenario: Ended by locking
- **WHEN** the user locks that laptop
- **THEN** the log contains `relay.disabled` with reason `locked`

#### Scenario: Relayed write
- **WHEN** an assistant creates two tasks through the relay
- **THEN** the log contains one `agent.write` with a count of 2 and no title
