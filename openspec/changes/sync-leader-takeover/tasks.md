## 1. Build

- [x] 1.1 `platform.leader.request` takes `steal`
- [x] 1.2 `sync.ts`: ping and pong, the follower's check (every 20 s, 5 s wait, 2 misses), the takeover with `steal`, the step-down of a leader that lost its lock
- [x] 1.3 `SyncStatus`: "Not synced since {time}" / "Not synced yet" after 15 minutes in idle or syncing, amber, visible words
- [x] 1.4 Tests: a follower takes the lock from a silent holder and syncs; an answering leader keeps it; a leader whose lock is stolen steps down and one working tab leads; the stale rule and the dot
- [x] 1.5 Translations, changelog fragment, docs

## 2. Checks

- [x] 2.1 Web typecheck, lint and tests; `make openspec-validate`; `make repo-check`

## 3. Real browsers

- [ ] 3.1 Firefox and Chrome: two tabs, freeze the leader (devtools → pause the leader's debugger or "Discard" the tab in about:unloads or chrome://discards), edit in the other tab: within about a minute the edit reaches the server
