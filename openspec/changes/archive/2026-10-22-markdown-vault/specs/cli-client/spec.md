## MODIFIED Requirements

### Requirement: Online-only client
The client SHALL hold no local copy of tasks and SHALL make no changes when the server cannot be reached; it SHALL fail fast with exit code 4 and a message naming the server URL. The one exception SHALL be the vault commands (`ot vault`, OpenSpec `markdown-vault`): a vault folder holds the account's projects and tasks as files, and the vault's own `.opentodo/` state (its device id, cursor and last-synced values), and `ot vault status` reads them without the server; every other command still holds nothing locally. Because every write goes through the REST API or, for the vault, through the sync exchange, which both record operations in the log, changes made with the client converge on all devices under the same last-writer-wins rule as web edits, and a network failure never leaves a half-applied change.

#### Scenario: Server down
- **WHEN** the server does not answer within the timeout
- **THEN** the command exits with code 4, names the URL and suggests checking connectivity

#### Scenario: Concurrent edit converges
- **WHEN** the client changes a task's priority while a phone changes its title offline, and the phone later syncs
- **THEN** every device shows both the new priority and the new title

#### Scenario: Only the vault keeps state
- **WHEN** the user runs `ot list` and `ot vault status` on a machine with a vault
- **THEN** `ot list` reads everything from the server and keeps nothing, and `ot vault status` reads only the vault folder and its `.opentodo/` state
