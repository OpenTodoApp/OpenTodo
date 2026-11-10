# Tasks

## 1. Spike

- [x] 1.1 Confirm host support, capability name and MIME type of MCP Apps resources; record the result in `design.md`. Verify with a working "hello" resource rendered in at least one host, noted in the PR.

## 2. Server

- [x] 2.1 The announcement (`initialize` → `Mcp-Session-Id: apps.…`), and `show_tasks`, `show_calendar` and `show_deadlines` offered to Apps-capable clients only; refused on the server path for encrypted accounts. Verify with `internal/mcp` and `internal/httpapi` tests (`tools/list` with and without the announcement, the session id, the encrypted refusal); run `go test ./...`.
- [x] 2.2 The embedded view for the three kinds and the block rows (`internal/agenttools`): static `ui://opentodo/blocks/<kind>` resources, strict CSP, no external reference, tokens equal to `web/src/index.css`, rows without projects kept away. Verify with tests on the view (CSP hashes, no external URL, text-only rendering of a malicious title), the "Unknown resource" and "Without a token" scenarios; run `go test ./...`.
- [x] 2.3 Actions through the host as MCP write tool calls under the existing gates. Verify with `internal/mcp` tests that `can_complete` and `complete_tasks` require an `agent` token and both switches.

## 3. Bridge and docs

- [x] 3.1 `ot mcp --decrypt` keeps the session id, sends the bridge header and decrypts block rows while keeping the kind-and-count text. Verify with `internal/cli` tests on encrypted fixtures shared with the server tests.
- [x] 3.2 Docs (`mcp.md`: which hosts, what shows, privacy) and the changelog fragment. Verify with `make docs-check`.
