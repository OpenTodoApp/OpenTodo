## Decisions

### D1: The server says whether a retry can help

Only a schema mismatch can lift: an entity or field this server doesn't know. `SplitInvalid` checks it with the same `fieldKind` that `Validate` uses, before deciding the reason. A reserved device is always `invalid`, whatever the field.

For an `invalid` op, the server's current value comes back the same way as for any refused op. The handler hands the ops to `Apply` through the request context (`WithInvalidRefused`, like `WithClockSkewRefusal`), and `Apply` adds them to the batch's refused list, so the existing `restoreOps` reads their values with the caller's access. A request limited to workspaces gets no such values, because these ops never passed its reach check. Only API tokens are reach-limited, and `/api/v1/sync` refuses workspace-limited tokens today, so this guards the service layer.

### D2: The client ends a verdict like `forbidden`

`isHeldReason` holds `limit_*` and `unknown_field`. An `invalid` refusal goes through `forgetRejected`, as refusals on the merits do. The local clock is forgotten, and the field is reset to its `OP_DEFAULTS` value, so a field the server has no value for doesn't keep the refused value on this device alone. A server value in the same answer then wins.

The notice counts these refusals (`invalid`) and, when all of a notice's refusals are invalid, says "(this server could not accept the value)" instead of a role change. It names the tasks as other notices do, and the person dismisses it as any notice. No error state remains.

## Risks

- **Older client, newer server:** a client from #1475 that gets `unknown_field` drops that change instead of holding it. The web app is served by the server it syncs with, so its field set never runs ahead. A native shell loads the same web app.
