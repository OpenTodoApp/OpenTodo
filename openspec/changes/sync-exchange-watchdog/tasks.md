## 1. Build

- [x] 1.1 `sync.ts` `runOnce`: a watchdog on `alive()` progress (`EXCHANGE_STALL`, 2 min, checked every 10 s); a stalled exchange is abandoned, its controller aborted, the error shown, and a retry scheduled
- [x] 1.2 Test: a leader that keeps answering pings but whose exchange hangs syncs again, and the follower shows it

## 2. Checks

- [x] 2.1 Web typecheck, lint and tests; `make openspec-validate`; `make repo-check`

## 3. Real browsers

- [x] 3.1 Chromium: requests hung by a proxy for 45 s, and a server restart mid-session; the next write arrives in each case
- [ ] 3.2 Firefox: the same, plus a tab that navigates from the app to another site while it leads (back-forward cache), then a second tab
