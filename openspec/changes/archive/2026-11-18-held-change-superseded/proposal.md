## Why

#1532 point 4. A change held on the device is offered to the server again every minute. That includes one refused as `unknown_field` and one a server limit refused. It stays held even when it can no longer change what anyone sees:
- the same field was written again since, on this device or another;
- its row was moved to the Trash.

The sync status keeps showing an error for a change that no longer matters, and nothing ends it.

## What Changes

- **Superseded held changes are dropped.** When held changes are offered again, one is dropped instead in either case:
  - its row's field has a newer clock under the last-writer-wins rule, from a later edit on this device or a value pulled from another;
  - its row is in the Trash. A held change of `deleted_at` itself is kept.

  The rest are offered again as before.

## Capabilities

### Modified Capabilities

- `offline-first-sync`: "A refusal on an unknown field keeps the change on the device" says when a held change ends.

## Impact

- `web/src/lib/limits.ts` (`requeueHeld`), with a test in `limits.test.ts`. No server or protocol change.
