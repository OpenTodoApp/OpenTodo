# Spec Delta

## ADDED Requirements

### Requirement: Malformed sync answers leave the device unchanged
The client SHALL check that a sync answer has the shape of a sync response before it removes anything from the outbox or applies anything. An answer that does not (for example a page served by a proxy or captive portal with a success status) SHALL leave the outbox, the cursor and the local data unchanged and SHALL show a sync error; the queued changes SHALL be sent again on the next exchange, and convergence SHALL follow from the server ignoring op ids it already holds.

#### Scenario: Proxy page with status 200
- **WHEN** the device has an offline edit queued and the sync request is answered with status 200 and an HTML page
- **THEN** the edit stays queued, the cursor is unchanged, the status shows an error, and the next successful exchange uploads the edit

### Requirement: Refusals are handled before an exchange can stop
When a sync answer is accepted, the client SHALL remove the sent batch from the outbox in the same local transaction that keeps the changes a server limit refused and forgets the local clocks of refused changes, before any later step can end the exchange. When the exchange then stops because the device holds no key for an encrypting account, the cursor SHALL stay unchanged, so the server's values arrive after unlocking and win; held changes SHALL stay on the device and be offered again later.

#### Scenario: Locked answer with a limit refusal
- **WHEN** a device sends two edits, the server refuses one for a storage limit and one as forbidden, and its answer shows that encryption was turned on elsewhere while this device has no key
- **THEN** the device shows the locked state, keeps the limited edit as held, counts it as pending, and no longer treats the forbidden edit as the newest value

### Requirement: Every entity kind is re-seeded and handled when refused
The client SHALL map every synced entity kind to its local table in one place that has no default table. Re-seeding after a server restore SHALL send every synced entity kind, custom field definitions included, with their original clocks so devices converge as by the normal rule. A refused change to any entity kind SHALL have its local clock forgotten, and a row of any kind that existed only on this device and was refused SHALL be removed without failing the exchange.

#### Scenario: Custom field definitions after a restore
- **WHEN** the server is restored from a backup and the device holds a custom field definition
- **THEN** the re-seed sends the definition's fields with their original timestamps and devices

#### Scenario: Refused custom field change
- **WHEN** the server refuses an offline rename of a custom field definition and sends its own value
- **THEN** the definition shows the server's name, and a definition that only existed on this device is removed

#### Scenario: Refused link attachment
- **WHEN** the server refuses a link attachment this device created offline
- **THEN** the exchange completes without an error, the attachment is removed locally and the user is told a change was not accepted
