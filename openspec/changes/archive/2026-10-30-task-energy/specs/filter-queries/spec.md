## ADDED Requirements

### Requirement: Energy terms
`energy` SHALL match tasks that have an energy (OpenSpec `task-energy`), `no energy` tasks that have none, and `energy: value` (quotes allowed, case ignored) tasks whose energy equals `deep`, `medium` or `low`. Any other value SHALL be an error naming the three valid values. All three SHALL be keywords in the published grammar, accepted by the server's validation of saved views, and evaluated on the device from local data with the same open-only default as every other term, offline included; `energy` SHALL be a reserved word. A value a client does not know SHALL match `no energy`.

#### Scenario: End of the day list
- **WHEN** the user enters `energy: low & unblocked & today`
- **THEN** today's open, unblocked tasks with Low energy are listed

#### Scenario: Unknown value
- **WHEN** the user enters `energy: high`
- **THEN** the query is not run and the error says the energy is deep, medium or low

#### Scenario: Saved and offline
- **WHEN** the user saves `energy: deep & #Work` as a view and later opens it on an offline device
- **THEN** the server accepts the view, and the device lists the open Deep tasks of "Work" from local data

#### Scenario: Reserved word
- **WHEN** a project defines a custom field named "Energy" and the user enters `energy`
- **THEN** the term is the energy keyword, and the field is reachable only through its quoted name

#### Scenario: Works with the switch off
- **WHEN** the Energy levels switch is off and the user enters `no energy`
- **THEN** open tasks without an energy are listed
