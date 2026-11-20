## MODIFIED Requirements

### Requirement: A refusal on an unknown field keeps the change on the device
The client SHALL announce `invalid_ops`. It SHALL keep an operation the server refused with reason `unknown_field`: the row SHALL keep its value, the change SHALL count as pending, and it SHALL be offered again with the changes a server limit holds. A held change, of either kind, SHALL be dropped instead of offered again once its field was written again since (the row's clock for the field wins over the change's under the last-writer-wins rule, whether the newer write was made on this device or pulled from another) or its row is in the Trash; a held change of `deleted_at` itself SHALL be kept. The rest of the outbox SHALL keep syncing. While such a change is held, the sync status SHALL show the error state with a sentence that says a change could not be accepted and stays on the device. An operation refused with reason `invalid` SHALL end like any refused change: it SHALL NOT be held or offered again, the field SHALL take the server's value, or its default when the server has none, and the not-accepted notice SHALL say that the server could not accept the value.

#### Scenario: One change the server cannot accept
- **WHEN** the server refuses one of two edits with reason `unknown_field`
- **THEN** both tasks keep their edited values, the other edit is synced, the status shows the error with that sentence and one pending change, and the held edit is sent again a minute later

#### Scenario: Accepted later
- **WHEN** a held change is sent again and the server now accepts it
- **THEN** the status returns to synced and nothing is pending

#### Scenario: A value the server will never accept
- **WHEN** the server refuses an edit of a task's title with reason `invalid` and sends its stored title
- **THEN** the task shows the stored title, nothing is pending or offered again, the status reads synced, and a notice says one change was not accepted because the server could not accept the value

#### Scenario: Written again before it is accepted
- **WHEN** a held change of a task's title is waiting and the user edits the title again, and the server applies the new edit
- **THEN** the held change is not offered again, and once nothing else is held the status returns to synced
