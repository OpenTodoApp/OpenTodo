## MODIFIED Requirements

### Requirement: Field-level operations
Every change SHALL be expressed as operations that each set one field of one entity and carry a unique id, a timestamp in milliseconds from a monotonic hybrid clock, and the id of the device that produced it. The server SHALL validate entity, field and value type against a published schema and SHALL reject a batch containing an invalid operation. For a device that announces the feature `invalid_ops`, the server SHALL instead refuse each operation that fails validation, or names a device only the server may write, alone, in `rejected` with reason `invalid`, and SHALL apply and answer the rest of the request as usual. This replaces every whole-batch `invalid_op` refusal of the sync exchange for such a device, except a batch over the size limit.

#### Scenario: Invalid operation in a batch
- **WHEN** a sync request without the feature `invalid_ops` contains an operation for an unknown field
- **THEN** the whole request is refused with a 400 `invalid_op` error and no operation from it is stored

#### Scenario: Invalid operation from a device that handles it
- **WHEN** a sync request with the feature `invalid_ops` contains an operation for an unknown field, one with the device `server`, and a valid one
- **THEN** the answer is 200, the first two are in `rejected` with reason `invalid`, and the valid one is stored

## ADDED Requirements

### Requirement: An invalid refusal keeps the change on the device
The client SHALL announce `invalid_ops`. It SHALL keep an operation the server refused with reason `invalid`: the row SHALL keep its value, the change SHALL count as pending, and it SHALL be offered again with the changes a server limit holds. The rest of the outbox SHALL keep syncing. While such a change is held, the sync status SHALL show the error state with a sentence that says a change could not be accepted and stays on the device.

#### Scenario: One change the server cannot accept
- **WHEN** the server refuses one of two edits with reason `invalid`
- **THEN** both tasks keep their edited values, the other edit is synced, the status shows the error with that sentence and one pending change, and the held edit is sent again a minute later

#### Scenario: Accepted later
- **WHEN** a held invalid change is sent again and the server now accepts it
- **THEN** the status returns to synced and nothing is pending
