# Design: MCP stdio bridge

## Transport

Each non-empty stdin line is one JSON-RPC message and one HTTP `POST /mcp`.
JSON responses are emitted as one stdout line; HTTP 202 notification responses
emit nothing. Input is capped at the server's 1 MB request limit. JSON-RPC
client errors are forwarded, and recoverable HTTP failures are mapped to a
JSON-RPC error for requests so one bad message does not end the stdio session.
Authentication failures and failed notifications still stop the bridge.

## Credentials

The bridge uses normal profile/environment resolution. Before serving, it asks
`GET /api/v1/me` for the scope of the credential that authenticated that exact
request. Scope `read` is accepted; other scopes require `--allow-full-token`.
This is a local safety default, not a server authorization change.

## Data, offline, and convergence

No data is stored or mutated. The command needs the configured server online;
offline requests fail like other CLI requests. Op-log convergence is unaffected.

## Size

Standard library only. Binary size and runtime memory change only by the small
CLI implementation and a scanner buffer bounded to 1 MB.
