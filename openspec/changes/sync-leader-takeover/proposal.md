## Why

On 16 Nov the owner's everyday Firefox profile stopped syncing for about a day without any sign. Projects and tasks written elsewhere never arrived, their own edits never left, and the sync dot stayed green. `navigator.locks.query()` showed the cause. Another client in the profile held the `opentodo-sync` lock, and the visible tab waited behind it.

Only the tab holding that lock runs the sync loop. The others ask it to sync and display the status it broadcasts. A holder that stops answering (a frozen or half-closed tab) therefore stops every tab of the browser, and nothing on screen changes. For a local-first app, a client that silently stops syncing is the worst failure there is.

## What Changes

- **A silent leader loses the lock.** A follower checks every 20 s that the leader answers a ping. After two missed answers in a row, it takes the lock (Web Locks `steal`) and runs the sync loop itself.
- **A leader whose lock is taken steps down.** Its timer and live channel stop, and it waits for the lock again as a follower, so two tabs never keep leading.
- **The dot never claims "Synced" when nothing arrives.** When the last sync is older than 15 minutes, or a tab has never synced in the 15 minutes since it opened, and the state otherwise reads fine (synced or syncing), the dot turns amber and reads "Not synced since {time}" ("Not synced yet"). A click syncs now.

## Capabilities

### Modified Capabilities

- `offline-first-sync`: "One tab syncs" adds the takeover from a leader that stopped answering.
- `app-shell`: "Sync status is quiet" adds the stale state.

## Impact

- `web/src/lib/sync.ts` (the one-tab part): ping and pong messages, the follower's check, the takeover, the step-down.
- `web/src/lib/platform.ts`: `leader.request` takes `steal`. The native shells have no shared lock and are unaffected.
- `web/src/app/SyncStatus.tsx`: the stale state.
- Older tabs still running the previous build don't answer pings, so a new tab takes over from them, and both then sync for a while. Ops are idempotent by op id, so that's harmless.
- No server, data or op change.
