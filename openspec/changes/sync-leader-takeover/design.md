## Decisions

### D1: A ping the leader answers at once

The follower sends `{type: 'ping', id}` on the channel every 20 s. The leader answers `{type: 'pong', id}` from its message handler, outside any exchange, so a long pull doesn't make it look silent. A pong not received within 5 s is a miss, and two misses in a row make the follower take over. The check costs one message, never a sync request, so a browser with many tabs doesn't hit the server more.

### D2: Take over with `steal`

The follower drops its queued lock request and asks again with `steal: true`. The browser releases the holder's lock and rejects its request, and the follower gets the lock and leads as usual: timer, live channel and the first exchange. The outbox lives in the shared database, so the new leader sends what the old one never did.

### D3: A leader that loses its lock steps down

When the leader's own lock request rejects while it's still leading, the lock was taken. It clears its timer and live channel and queues for the lock again as a follower, with its own check. If it was only slow, the worst case is one exchange running in two tabs: ops are idempotent, and the next exchange converges.

### D4: Stale beats green

Fifteen minutes is three times the live channel's five-minute check, so a quiet but connected account never reads as stale. The stale state applies only over states that would otherwise say all is well (idle, syncing). Error, offline, locked, signed out and limited keep their own words. A tab that never synced counts from when it opened. The dot is amber, the words are visible (not tooltip-only), and the accessible name starts with them.

## Risks

- **A tab whose main thread is blocked for 10 s or more** loses the lead to another tab. That's harmless: it steps down and follows.
- **Firefox and Chromium both support `steal`.** A browser without Web Locks already makes every tab sync on its own.
