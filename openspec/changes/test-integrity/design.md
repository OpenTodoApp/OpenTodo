# Design: test-integrity

## D1. staticcheck without a module dependency
`go run honnef.co/go/tools/cmd/staticcheck@v0.8.1 ./...` downloads the tool through the module proxy into the module cache; go.mod and go.sum are unchanged and the binary size is unaffected. v0.8.1 (2026.2.1, August 2026) supports Go 1.26; the version lives once, in `STATICCHECK_VERSION` in the Makefile, and CI calls `make staticcheck`. All checks stay on: no `staticcheck.conf` exclusions are needed after the fixes.

## D2. The schema fixture is data, not generated code
The fixture lists field names only (kinds stay in Go: the client has no kind table). The Go test compares it with `Schema`, `FieldValuePrefix`, `e2ee.ContentFields` and `ContentPrefixes`, and checks every content field is a schema field. The vitest compares it with `ENTITIES`, the row defaults (`DEFAULTS` in `ops.ts`, now exported; the `fields` key holds the `fields.<id>` family) and `CONTENT_FIELDS`/`CONTENT_PREFIXES`. Adding a field means editing the fixture and both sides, which is what AGENTS.md already asks.

## D3. Property test model
The simulated device follows the web client: the HLC of `hlc.ts` (offset, server time observation, restart after `clock_skew`), last-writer-wins on local and pulled ops (`applyOps`), the restamp of `restampSkewed` (the row's clock follows only while it still holds the refused op) and confirmed backfill pages. The server runs with clock-skew refusal. Each run: 240 random steps (edit, exchange with shuffled ops split over two requests and random page sizes, clock advance), skews from ten minutes slow to two hours fast, Alice shares her project with Bob at step 120; then every device exchanges until outboxes are empty. Assertions: every replica field equals `Get` for that account and the LWW replay of the `ops` table (value and clock), and each device holds exactly the fields its account can see. Six seeds per run (two with `-short`), about 1.5 s; each seed is logged and `OPENTODO_PROPERTY_SEED` replays one. Dropping the restamp clock update makes it fail on the first seed.

## D4. Calendar bound in work units
`maxExpandWork` already counts rule periods and starts. The test spends one expansion budget on one 1970 series and asserts at most 1200 units (about 940 today; a walk from DTSTART costs 40,000), then checks 2000 such series stop at the budget with both warnings. No wall clock.

## Data model impact
None. No new dependency in go.mod or package.json; container image and runtime memory unchanged.
