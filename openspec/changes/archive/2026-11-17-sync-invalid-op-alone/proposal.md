## Why

`POST /api/v1/sync` refuses the **whole** request with 400 `invalid_op` when one op in it fails validation or carries a device only the server may use. Nothing is applied and nothing is pulled. The client keeps the batch and sends it again on every exchange, so one op it cannot fix stops that device's sync for good. On 16 Nov the re-seed after a restore did exactly that (fixed in `reseed-reserved-devices`). Any other op the server cannot read would do the same: a field a newer client knows and an older server doesn't, a value the schema narrowed, or a client bug. "Sync must never stop silently" asks that one bad op never blocks the rest.

## What Changes

- **The server refuses such an op alone.** A device that sends the feature `invalid_ops` gets each op that fails validation, or carries a reserved device, back in `rejected` with reason `invalid`. The rest of the batch is applied and the pull runs as usual. A device that doesn't send the feature gets the 400 as before.
- **The client keeps the change.** An `invalid` refusal is not a verdict on the value, so the client holds the op like one a server limit refused: the row stays as edited and the change stays pending. It is offered again with the held ops, every minute, so a server that learns the field later takes it. The status shows the error state with "This server could not accept a change from this device. It stays on this device, and everything else keeps syncing." The web client sends the feature.

## Capabilities

### Modified Capabilities

- `offline-first-sync`: "Field-level operations" refuses an invalid op alone for a device that announces `invalid_ops`; a new requirement covers how the device keeps it.

## Impact

- `internal/sync/validate.go` (`SplitInvalid`, `ReasonInvalid`) and `internal/httpapi/sync_handlers.go`.
- `web/src/lib/api.ts` (the feature), `limits.ts` (held reasons and the sentence), `sync.ts` (the status), and one new string in every shipped language.
- Additive: older clients and push-only devices that don't send the feature see no change. Checks that run during apply (for example rotation) still refuse the whole batch. They are rare and stay as they are.
- No op, schema or data change.
