## ADDED Requirements

### Requirement: stdio bridge

The CLI SHALL bridge newline-delimited MCP JSON-RPC messages from stdin to the
configured server's `/mcp` endpoint, write only JSON-RPC responses to stdout,
and remain read-only by requiring a read-scoped token unless the operator makes
an explicit command-line override.

#### Scenario: Request and notification forwarding

- **WHEN** a stdio client sends `initialize`, an initialized notification, and `tools/list`
- **THEN** the CLI forwards all three messages with the configured bearer token
- **AND** writes the two JSON-RPC responses, but no output for the notification

#### Scenario: Full-access credential safety

- **WHEN** the configured token has full scope and no override is present
- **THEN** the CLI refuses to start the bridge without forwarding protocol data

#### Scenario: Read-only mode cannot be weakened

- **WHEN** `--read-only` or `OPENTODO_READ_ONLY=1` is active with a full-scoped token
- **AND** `--allow-full-token` is also present
- **THEN** the CLI refuses to start the bridge without forwarding protocol data

#### Scenario: Protocol error recovery

- **WHEN** the server returns a JSON-RPC parse error for a malformed input line
- **THEN** the CLI forwards that error and continues serving subsequent messages

#### Scenario: Recoverable server error

- **WHEN** the server returns a transient error for a JSON-RPC request with an id
- **THEN** the CLI writes a JSON-RPC internal error for that id and continues serving

#### Scenario: Server unavailable

- **WHEN** the configured server cannot be reached
- **THEN** the CLI exits with its unreachable-server status and writes no protocol response to stdout
