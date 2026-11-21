## Decisions

### D1: Progress, not duration

The watchdog measures time since the exchange last called `alive()`, not since it started. A first copy of a large account takes many pages and minutes in total, but every page checks in. Two minutes without a check-in is four times the 30-second request deadline, so a slow but working step is never cut. The check runs every 10 seconds, and both values are a test knob (`EXCHANGE_STALL`).

### D2: Abandon, don't wait

The exchange's promise is raced against the watchdog, and the exchange is not awaited further. A flag makes its next `alive()` throw `SessionEnded`, so it writes nothing after it wakes. Its abort controller is aborted and dropped, so the next exchange gets a fresh one. `running` and `current` are cleared by `syncNow`'s `finally` as for any finished exchange, so sign-out and `resign` no longer wait on it.

### D3: Reported like a timeout

The status shows the error state with the existing timeout message. It doesn't show offline, because the network may be fine. The retry uses the existing backoff (`scheduleRetry`), so a step that hangs every time doesn't spin.

## Reproduction

- **Code:** `syncLeader.test.ts` "a leader whose exchange hangs …": the leader keeps answering the follower's pings, and its exchange hangs on a request that never settles. It fails on main (nothing syncs again) and passes with D1–D3.
- **Chromium (real app, two tabs):** a proxy that hangs every request for 45 s, then passes them again: the next write arrived within a second. A server killed and restarted mid-session: the next write arrived 6 s after the restart. A page holding the lock whose tab navigates to another origin releases it at once (the second tab got it). None of these left a stuck leader in Chromium.
- **Firefox:** not run here (no Firefox in this environment). The incident's holder survived closing every tab of the site, which suggests a client that isn't a visible tab of the site. One candidate is the app's document kept in the back-forward cache of a tab that now shows another site, still holding the lock. That is unconfirmed; `sync-leader-takeover` handles it either way, because such a holder never answers a ping.

## Risks

- **A device that is very slow for 2 minutes on one step** has that exchange cut and retried. The retry starts from the stored cursor, so the work is redone, not lost.
