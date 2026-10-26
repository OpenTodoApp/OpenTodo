# A Things database runs none of its own expressions on the server

## Why

The Things importer reads an uploaded SQLite file. It was opened read-only with `query_only` and a 30-second deadline, but SQLite still evaluates expressions stored in a schema while it reads: a generated column's expression runs for every row, and a virtual table's module computes its rows. A small upload with a generated column could pin a core until the deadline or allocate hundreds of megabytes per preview (security audit finding M3, found in an internal audit). Preview has no per-user serialisation, so a few requests in parallel multiply that.

## What Changes

- Before reading any row, the importer refuses a file whose Things tables (`TMTask`, `TMArea`, `TMTag`, `TMTaskTag`, `TMChecklistItem`, `Meta`) are virtual tables or have hidden or generated columns (`pragma_table_xinfo`). Things' own databases have neither.
- The connection that reads the file has `SQLITE_LIMIT_LENGTH` lowered to 1 MiB, so no value longer than that, stored or computed, is ever materialised.
- The pragma, the limit and every query use one pinned connection; the 30-second deadline stays.
- Triggers and views are not refused: neither runs on a read, and the importer reads only the tables above.

Not **BREAKING**: no op, API or variable changes.

Out of scope: a per-user limit on concurrent previews (with no expression evaluated, the cost of a preview is bounded by the upload size, as for every other format). Advances the 0.14.1 security release (no ROADMAP item).

## Impact

- `internal/importer/profile_things.go`; tests `internal/importer/things_limits_test.go`.
- `docs/import.md`, CHANGELOG.
