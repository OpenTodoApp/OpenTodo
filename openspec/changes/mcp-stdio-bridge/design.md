# Design: MCP stdio bridge

## Transport

Each non-empty stdin line is one JSON-RPC message and one HTTP `POST /mcp`.
JSON responses are emitted as one stdout line; HTTP 202 notification responses
emit nothing. Input is capped at the server's 1 MB request limit. HTTP errors
use existing CLI error mapping and stderr, so stdout remains valid protocol data.

## Credentials

The bridge uses normal profile/environment resolution. Before serving, it reads
the token list and identifies the just-used token by `lastUsedAt`. Scope `read`
is accepted; other scopes require `--allow-full-token`. This is a local safety
default, not a server authorization change.

## Data, offline, and convergence

No data is stored or mutated. The command needs the configured server online;
offline requests fail like other CLI requests. Op-log convergence is unaffected.

## Size

Standard library only. Binary size and runtime memory change only by the small
CLI implementation and a scanner buffer bounded to 1 MB.
