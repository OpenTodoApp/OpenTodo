# Spec Delta

## ADDED Requirements

### Requirement: Optional demo mode
The server SHALL accept an optional `OPENTODO_DEMO` variable, off when unset. `true` SHALL turn the instance into a public demo (OpenSpec `demo-mode`); an invalid value SHALL stop startup with a message naming the variable. Demo mode SHALL need no other variable and SHALL be meant for a dedicated data directory.

#### Scenario: Unset
- **WHEN** the server starts without `OPENTODO_DEMO`
- **THEN** it behaves exactly as before and the owner setup screen appears on an empty data directory

#### Scenario: Invalid value
- **WHEN** `OPENTODO_DEMO=sometimes` is set
- **THEN** the process exits non-zero with a message naming `OPENTODO_DEMO`
