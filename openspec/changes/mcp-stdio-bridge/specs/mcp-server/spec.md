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

#### Scenario: Server unavailable

- **WHEN** the configured server cannot be reached
- **THEN** the CLI exits with its unreachable-server status and writes no protocol response to stdout
