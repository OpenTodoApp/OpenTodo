## Why

Follow-up of `held-change-superseded` (#1584). A held change (refused with `unknown_field` or by a server limit) was dropped when its row was in the Trash. A row in the Trash can be restored: the device then keeps the edited value, but the server never gets it, and the two disagree for good without any sign.

## What Changes

- **A held change of a row in the Trash stays held.** It is not offered while the row is there, and it is offered again with the next retry once the row is restored. A held change whose field was written again since is still dropped, in or out of the Trash.
- A row purged for good leaves the device; a change still held for it is then offered once and the server discards it, as it does every op for a purged row.

## Capabilities

### Modified Capabilities

- `offline-first-sync`: "A refusal on an unknown field keeps the change on the device" says a held change waits while its row is in the Trash.

## Impact

- `web/src/lib/limits.ts` (`requeueHeld`), its test in `limits.test.ts`, the changelog line of `held-change-superseded`. No server or protocol change.
