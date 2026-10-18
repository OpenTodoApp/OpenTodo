# Tasks

## 1. iCalendar unfolding (INT-1)

- [x] 1.1 Linear `unfoldLimited` with logical-line, physical-line and line-length limits used by `ParseWithLimits`. Verify: `go test ./internal/caldav -run 'Unfold|LineLength'` (1 MB and 2 MB fold bombs parse to `ErrInvalid` in well under a second; 64 KB line accepted, longer refused); `BenchmarkParseFoldBomb`; `FuzzParseICal` for 30 s.

## 2. MCP batches (INT-5)

- [x] 2.1 `HandleVersion` refuses batches under 2025-06-18 and later, caps them at 20 messages otherwise, and stops running requests once the answer reaches 4 MB; the transport passes the protocol header. Verify: `go test ./internal/mcp -run Batch` and `go test ./internal/httpapi -run TestMcpTransportNegotiation`.

## 3. Feed expansion (INT-2)

- [x] 3.1 Rules without `COUNT` start at the window; a shared work budget and a 5 s deadline stop the expansion with a warning. Verify: `go test ./internal/calfeed -run Expand` (2,000 daily events since 1970 expand in about a second, a 1970 series has its occurrences today, skipping matches the full walk for every supported rule part, budget and deadline warn).

## 4. Docs and checks

- [x] 4.1 `docs/mcp.md` and the calendar docs list the limits; CHANGELOG under Security. Verify: `make docs-check`; `go vet ./...`; `go test ./...`.
