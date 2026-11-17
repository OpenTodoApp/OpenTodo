## Why

On 16 Nov the owner's Firefox profile stopped syncing for about a day while the dot stayed green: a client nobody could see held the `opentodo-sync` lock and the open tab waited behind it. `sync-leader-takeover` makes a follower take the lock from a holder that stops answering pings. That covers a frozen holder, but not a leader that still answers while its sync loop is stuck.

The leader answers pings from its message handler, outside the exchange. If one step of an exchange never settles (an IndexedDB request that never completes, a stubbed or broken fetch that ignores its abort signal, anything awaited without a deadline), `running` stays true for good. Every later `syncNow` only sets `again`, followers keep getting pongs, and no tab of the browser syncs again until that tab is reloaded. Sign-out waits for the same exchange (`stopSyncAndWait`, and the lock `resign` releases only once it settles), so sign-out hangs too. A unit test reproduces this on the code with the takeover in it.

## What Changes

- **A stuck exchange is given up.** Each step of an exchange already checks in through `alive()`. An exchange that has not checked in for 2 minutes is abandoned: its request is aborted, any later step of it throws before writing, the status shows the error "The server took too long to answer. Your changes stay on this device.", and the next exchange runs with the usual backoff.
- The lock, the takeover and the status dot are unchanged.

## Capabilities

### Modified Capabilities

- `offline-first-sync`: adds "An exchange never stops the sync loop".

## Impact

- `web/src/lib/sync.ts` (`runOnce`): a watchdog per exchange. No platform change; it uses only timers, so the native shells get it as well.
- An abandoned exchange that wakes up later can finish the one write it was in. Ops are idempotent by op id and a cursor set back only pulls a page again, so the next exchange converges.
- No server, data, op or string change.
