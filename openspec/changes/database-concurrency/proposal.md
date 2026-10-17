# Database concurrency: reads beside the writer, scope-bounded query plans

## Why

A core audit found two database problems (reports CORE-6, CORE-7):

- **One connection for everything (CORE-6).** `store.OpenFile` sets `SetMaxOpenConns(1)`, so every read (task lists, sync pulls, exports, MCP and CalDAV reads) queues behind any write in progress: a large import, a Trash purge or a long sync batch stalls every user's lists. Write transactions begin `DEFERRED`, so a second process on the same file (a newer server during a rolling update, `opentodo reset-owner-password`) can fail with "database is locked" when both upgrade a read snapshot to a write.
- **Plans that leave the user's data (CORE-7).** Queries over the visible scopes use `scope_id IN (...)`. With one scope they search the primary key; once a user joins a shared project SQLite picks the entity index (List, to avoid sorting by `entity_id`), reading every user's rows of that kind, or reads and sorts the whole history of the scopes after the cursor (Pull) before cutting the page. Measured on a 300,000-op log: List 4 ms for a personal-only user, 460 ms for a member of one shared project; the first Pull page 5.5 ms → 28 ms. `PRAGMA optimize` never runs, so the planner never has statistics.

## What Changes

- `store.OpenReader(dataDir)`: a pool of 4 query-only connections (`_query_only`, `busy_timeout`) on the WAL database, opened by the tenant after the writer migrated the file and closed with it. `sync.Service.SetReader` installs it; `List`, `Get` and the read part of `Pull` (a read-only snapshot) use it. The member-backfill step of a pull checks on the reader whether anything is pending and takes the writer only when there is history to replay or a page to confirm.
- The writer's DSN adds `_txlock=immediate`: write transactions take the write lock when they begin and wait `busy_timeout` for it. Read-only transactions stay deferred.
- The rule, documented in `internal/store` and AGENTS.md: a pure read may use the reader; anything that reads then writes in one transaction stays on the writer. A read after the caller's own committed write sees it (WAL).
- List drops `ORDER BY entity_id` (ids are sorted in Go), so the primary key is used for any number of scopes. Pull reads each scope's next page from its own index range (`UNION ALL` of per-scope `LIMIT`ed arms, merged in seq order) before joining the op rows.
- `PRAGMA optimize` (bounded by `analysis_limit`) runs at open after migrations and daily (self-hosted jobs; a host's housekeeping pass).

Out of scope: the activity feed, dependencies, public link view, `Memberships` and CalDAV queries (optimised in a parallel change; they stay on the writer here), backup snapshots (`VACUUM INTO` stays on the writer), and `maxSeq` (measured: SQLite's min/max already applies to `MAX(seq) ... IN (...)` here, so no change). No ROADMAP item; an audit fix.

No new dependency, environment variable, route, migration or op field. Not **BREAKING**.

## Capabilities

- `self-hosting`: reads do not wait for writes; query cost bounded by the visible scopes, planner statistics kept fresh (ADDED).
