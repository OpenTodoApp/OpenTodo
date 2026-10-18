# Test integrity: checked responses, static analysis, schema contract, convergence property

## Why

An audit of the test suites found tests that pass without checking what they claim, and contracts between server and client that nothing verifies:

- **Unchecked responses (OPS-25).** staticcheck reports 78 HTTP responses in tests (mostly `internal/httpapi`: import, mail, passkeys, assistant, MFA) that are assigned and never checked: the test reads the body of a 403 or 500 as if the request had succeeded. Nothing runs staticcheck, so the pattern keeps coming back.
- **No schema contract (DATA-16).** The op schema (`internal/sync` `Schema`) and the encrypted content fields (`internal/e2ee` `ContentFields`) are kept in step with the client's row defaults and `CONTENT_FIELDS` by comments only. A field added on one side syncs as an unknown field or is stored in plaintext. The client clock (`web/src/lib/hlc.ts`) has no unit tests of its own, and no test shows a 5xx answer keeps the queued edits.
- **Sync tests (CORE-23).** A package-level op counter in the sharing fixture makes the sync tests unsafe to run in parallel (the race detector flags it). Convergence is tested only on hand-written scenarios; nothing explores random orders, skewed clocks and a share in the middle.
- **Flaky calendar test.** `TestExpandOldSeriesIsFastAndComplete` fails on a slow or busy machine because it measures wall time.

## What Changes

- Every flagged response gets its status asserted; the other staticcheck findings are fixed (deprecated elliptic-curve coordinates replaced by `ecdsa.ParseUncompressedPublicKey`, the tenant creation reply keeps the created record when its re-read fails, an unused helper removed, smaller lint fixes).
- `make staticcheck` runs staticcheck at a pinned version (2026.2.1, `honnef.co/go/tools` v0.8.1, run with `go run`, nothing added to go.mod); `make check` and the Go job in CI run it.
- `internal/sync/testdata/schema_fixture.json` lists the op fields per entity, the field prefixes and the content fields; a Go test and a vitest check it against both implementations.
- HLC unit tests (monotonicity, seed, server time observation, skew bounds, tie-break) and a sync test for a 5xx answer.
- The sharing fixture's op counter is per fixture and its tests run with `t.Parallel()`. A seeded property test drives four devices of two accounts with skewed clocks through random edits, exchanges and a mid-way share, then checks that every replica equals the server and the server equals a replay of its op log.
- The calendar expansion test counts work units instead of wall time.

## Out of scope

- Coverage targets for specific packages (tenant, quickadd) and tests for other audit findings.
- Changing the client clock to observe remote timestamps.

## Roadmap

Advances the quality work behind every ROADMAP.md item; no feature item.

## Capabilities

- `offline-first-sync`: convergence verified by a seeded property test; shared op schema contract (added).
- `self-hosting`: static analysis gate in `make check` and CI (added).

No new environment variable, no op log format change.
