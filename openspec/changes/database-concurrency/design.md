# Design: database concurrency

## Handles

The writer stays a single connection (`SetMaxOpenConns(1)`): one process never contends with itself for SQLite's write lock, and memory stays flat. `_txlock=immediate` makes `database/sql` transactions that are not `ReadOnly` begin `IMMEDIATE`; modernc keeps `ReadOnly` ones deferred. Within one process nothing changes (the pool already serialises); across processes the second writer waits in `busy_timeout` instead of failing on a stale snapshot.

The reader pool (`store.OpenReader`) has `ReaderConns = 4` connections with `_query_only=1` and `busy_timeout(5000)`; it is opened after `store.Open` (so the file exists in WAL mode and is migrated) and closed in `Tenant.Close` before the writer. `mode=ro` was not used: a read-only open of a WAL file depends on the `-shm` file's state; `query_only` gives the same guarantee without that edge. Memory: up to 4 extra page caches (SQLite default 2 MB each, filled lazily). Binary and image size: unchanged (no new code dependency; the driver already supports both DSN keys).

Restores never swap the file under an open handle: a web restore is applied by `ApplyPendingRestore` before the tenant opens (after the restart it requests), and `opentodo restore` refuses while any server holds the directory. Reopening the tenant reopens both handles (test `TestReaderFollowsTheDatabaseAcrossReopen`).

## What reads where

`sync.Service.reader()` returns the pool when installed, else the writer (tests and tools that build a `Service` without a reader behave as before). Routed: `List`, `Get` (including their `loadAccess`) and the snapshot transaction of `PullWith`, which already was a pure read; together they cover REST lists and gets, the JSON export, MCP and the public link view's use of `Get`, and every pull. `backfillPage` reads then writes, so it stays on the writer; it is skipped (after a reader check) when no history is pending and no page is to be confirmed, so ordinary pulls never take the write lock. Feed, dependencies, public view, members and CalDAV helpers keep `s.db`: another change rewrites those queries.

## Query plans

- List: without `ORDER BY entity_id` the planner has no reason to prefer `scope_fields_entity (entity, entity_id)`; the primary key `(scope_id, entity, ...)` serves `scope_id IN (...) AND entity = ?`. List sorts ids in Go before its stable sort by position and creation, so ties keep the same order as before.
- Pull: `SELECT ... FROM (SELECT seq FROM (arm UNION ALL arm ...) ORDER BY seq LIMIT ?) s JOIN ops o ...`, each arm `SELECT seq FROM op_scopes WHERE scope_id = ? AND seq > ? ORDER BY seq LIMIT ?`. Each arm is a covering-index range bounded by the page limit; SQLite merges them (`MERGE (UNION ALL)`) and only the page's seqs reach `ops`.
- Verified with `EXPLAIN QUERY PLAN` with and without `ANALYZE` statistics (`TestQueryPlansStayInVisibleScopes`).
- `PRAGMA optimize = 0x10002` after `PRAGMA analysis_limit = 1000`: considers every table (reads run on other connections, so the writer's own query history is not a guide) and samples at most ~1000 rows per index.

## Numbers (BenchmarkScaleShared: 30 users × 10,000 ops + a 1,000-op shared project; `alice` is a member with 10,000 ops of her own, `carol` a member with 10)

| | before | after |
| --- | --- | --- |
| List, personal only (u0001) | 42 ms | 43 ms |
| List, alice | 456 ms | 54 ms |
| List, carol | 459 ms | 3.9 ms |
| First Pull page, alice | 27.9 ms | 3.9 ms |
| First Pull page, carol | 6.7 ms | 7.5 ms (noise) |

## Data model

No migration, no op field, no change to sync semantics: offline behaviour and convergence are unchanged (the same ops are served in the same order).
