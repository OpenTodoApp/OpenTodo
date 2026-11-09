# Tasks

## 1. Spike

- [ ] 1.1 Confirm host support, capability name and MIME type of MCP Apps resources; record the result in `design.md`. Verify with a working "hello" resource rendered in at least one host, noted in the PR.

## 2. Server

- [ ] 2.1 Capability negotiation, and display tools offered to Apps-capable clients only. Verify with `internal/mcp` tests (golden `tools/list` with and without the capability); run `go test ./...`.
- [ ] 2.2 `internal/mcpblocks` templates for tasks, calendar, choice, map (list), note and project; resources scoped to the token for 10 minutes. Verify with golden HTML tests (escaping, no external URLs) and the "Unknown resource" and "Without a token" scenarios; run `go test ./...`.
- [ ] 2.3 Actions through the host as MCP write tool calls under the existing gates. Verify with `internal/mcp` tests that ticking requires an `agent` token and both switches.

## 3. Bridge and docs

- [ ] 3.1 `ot mcp --decrypt` renders blocks locally for encrypted accounts. Verify with `internal/cli` tests on decrypted fixtures.
- [ ] 3.2 Docs (`mcp.md`: which hosts, what shows, privacy). Verify with `make docs-check`.
