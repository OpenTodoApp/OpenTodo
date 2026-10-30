# Filter queries have a length and nesting limit

## Why

The filter parsers recurse once per `(` and `!` and had no limit but the 4 MiB request body. A saved view whose query is a few million `(` made the server's parser overflow its goroutine stack, which is a fatal runtime error: the process exits, and on a hosted server every tenant goes with it (security audit finding H2, found in an internal audit). `recover` cannot catch a stack overflow, so the only fix is a limit the parser enforces before it gets that deep.

## What Changes

- A query is at most 4,096 characters (code points) and nests at most 64 levels of `(` and `!`. Each `(` and each `!` opens a level; sibling groups such as `(p1) & (p2)` count once.
- Both parsers, `internal/filter` on the server and `web/src/lib/filter/parse.ts` in the app, refuse a longer or deeper query with an ordinary syntax error, `Query is too long: N characters, at most 4096` or `Too deeply nested at position P; use at most 64 levels of "(" and "!"`. `POST` and `PATCH /api/v1/views` answer 400 `invalid_input` with that message, as for any other bad query.
- Shared vectors in `internal/filter/testdata/limits.json` pin the same limits and messages in both test suites; a Go fuzz test checks that no input panics.
- The app reads "Completed tasks: Show" by combining the parsed query with `open | completed` instead of parsing `(query) & (open | completed)` again, so a query at the limit still shows completed tasks.

Not **BREAKING**: no op, field or variable changes. A saved view whose query is over a limit (none the app can produce: the builder nests at most three levels) shows the error instead of results until it is edited.

Out of scope: rate limits on view writes. Advances the 0.14.1 security release (no ROADMAP item).

## Impact

- `internal/filter/filter.go`, its tests and `testdata/limits.json`; `internal/httpapi/views_test.go`.
- `web/src/lib/filter/parse.ts`, `evaluate.ts`, `index.ts`, `web/src/lib/views.ts`, `web/src/app/FilterView.tsx`, `filter.test.ts`; two new messages in every catalog.
- `docs/filters.md`, `docs/api.md`, CHANGELOG.
