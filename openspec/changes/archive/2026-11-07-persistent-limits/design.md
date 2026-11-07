## Context

`internal/httpapi` has about forty fixed-window limiters (`rateLimiter`: a map of key → start, count, refusals), swept by one background sweep. `internal/agenttools.Limiter` keeps, per token and per account, the call times of the last minute and the items changed in the UTC day. `internal/relay.Hub` keeps each account's relayed call times of the last minute, and `internal/mail.Limiter` each recipient's and the server's sending times of the last hour. All of them are maps in memory: a restart empties them.

## Decisions

### D1 — Memory stays the fast path; SQLite is written behind

Every check keeps reading and counting in memory, exactly as today, so a sign-in attempt or an agent call adds no database round trip. A limiter that changes a window marks its key and calls `Store.Changed`; the first change after a write wakes the tenant's `limits` job (`jobs.Limits`), which is due `ratelimit.FlushEvery` (one second) after its last run and writes every changed window in one transaction. `Tenant.Close` writes once more before the database closes, so a clean restart (an upgrade, `docker stop`) loses nothing; a crash loses at most the last second of counts.

Rejected: writing through on every hit. Many limiters count every request (quick-add parses, task pages, the map proxy's searches, CalDAV), and each write would queue behind the one writer connection that every sync and REST write uses. Failed sign-ins already pay for argon2id; the others do not.

The job is `WhileOpen`: on a host it never opens a closed tenant, and the windows of a closed tenant are written by its close. Expired rows are removed by the same job: it is due at the earliest stored `ends` when nothing waits to be written. No goroutine of its own; the existing in-memory sweep is unchanged.

### D2 — One table, named limiters

Migration `0062_limit_windows.sql` adds `limit_windows(limiter, key, start, ends, count, refused, hits)` with primary key `(limiter, key)` and an index on `ends`. `limiter` is a stable name per limiter (`login`, `account`, `mfa`, `agent`, `relay`, `mail`, …): `Server.limit(name, n, window)` creates a `rateLimiter` and registers it with the tenant's store under that name, which restores the windows that were still open. A fixed window stores its start, count and refusals (so the one audit event per window is not recorded twice after a restart); a sliding window stores its times as a comma-separated list in `hits`, which holds at most the window's limit (60 relay calls, 60 agent calls, 100 emails).

### D3 — Keys are hashed

Rate limits count by client address, account id, email address (a sign-in for an address without an account), token id and recipient. The audit log stores addresses only when the owner turned that on, so the limits table must not become a log of addresses. A limiter attached to a store keys its map by `Store.Key(raw)`: the first 16 bytes of SHA-256 over a random per-database salt (`settings` key `ratelimit.salt`) and the key, in hex. The in-memory map uses the same hashed keys, so a restored window is found again; hashing costs well under a microsecond. Someone who reads the database and its salt can test a guessed address against a row, which is far less than reading the addresses, and the rows expire with their window (an hour at most for addresses, a day for agent budgets).

### D4 — Agent limits, relay and email

- `agenttools.Limiter.Attach(store)` keeps one row per token or account: `start` is the UTC midnight of its day count, `count` the items, `hits` the last minute's calls; it ends at the next UTC midnight or a minute after the last call, whichever is later. The MCP and agent REST registry's limiter is attached; the routine engine's own registry is not an agent and keeps none.
- `relay.Hub` keeps each account's relayed call times in a `ratelimit.Times` (a sliding window helper in the package), attached as `relay`. The calls in flight and the streams per account are concurrency caps that end with the process, and stay in memory.
- `mail.Limiter` keeps its per-recipient windows and the server's window in one `ratelimit.Times` attached as `mail` (the server's under a key no recipient can have), so a restart does not reopen a recipient's five password-reset emails an hour.

### D5 — Host mode

Each tenant has its own store on its own database, built by `services.Build`, so one tenant's limits are never another's. The host's per-client request limiter (one minute, counted per host name before a tenant opens, `internal/host/limits.go`) stays in memory: it sheds load within one process and its window is shorter than most restarts take to matter. The per-tenant operation quotas are already counted from the op log when a tenant opens.

### D6 — Latency

The check path adds one SHA-256 of a short string and an atomic flag. `BenchmarkRateLimiterHit` (`internal/httpapi`) measures a check with and without the store (128 ns and 374 ns on the reference laptop; a failed sign-in spends tens of milliseconds on argon2id), and the server budgets (`go test -tags perf ./internal/perf -run ServerBudgets`) are measured before and after; the numbers are in the pull request.

## Data model

One additive table and one settings key; no op and no synced field, so offline behaviour and convergence are unaffected. Rows: one per key with an open window, removed when it ends; under a password-guessing attack from many addresses, one row per address and limiter for at most the window (a minute for most, fifteen minutes for the account lock). No dependency, no effect on image size; memory unchanged.

## Risks

- A crash loses up to a second of counts; a clean shutdown loses none.
- Two processes on one data directory during a rolling update each write their own windows; the last write of a key wins. Both still enforce the limit in memory.
