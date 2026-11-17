## MODIFIED Requirements

### Requirement: Every entity kind is re-seeded and handled when refused
The client SHALL map every synced entity kind to its local table in one place that has no default table. Re-seeding after a server restore SHALL send every synced entity kind, custom field definitions included, with their original clocks so devices converge as by the normal rule. A field whose clock names a device only the server may write (the server itself, an AI assistant, CalDAV, a rule, an issue or calendar connection, a public link or a task page) SHALL be sent with the original timestamp and this device's id, and the same SHALL apply to any such op already waiting in the outbox, so the server never refuses the re-seed. A refused change to any entity kind SHALL have its local clock forgotten, and a row of any kind that existed only on this device and was refused SHALL be removed without failing the exchange.

#### Scenario: Custom field definitions after a restore
- **WHEN** the server is restored from a backup and the device holds a custom field definition
- **THEN** the re-seed sends the definition's fields with their original timestamps and devices

#### Scenario: A field written through the API after a restore
- **WHEN** the server is restored and the device holds a task whose title was last written through the REST API or by an AI assistant
- **THEN** the re-seed sends the title with its original timestamp and this device's id, the exchange completes, and changes written elsewhere keep arriving

#### Scenario: Refused custom field change
- **WHEN** the server refuses an offline rename of a custom field definition and sends its own value
- **THEN** the definition shows the server's name, and a definition that only existed on this device is removed

#### Scenario: Refused link attachment
- **WHEN** the server refuses a link attachment this device created offline
- **THEN** the exchange completes without an error, the attachment is removed locally and the user is told a change was not accepted
