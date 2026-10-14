# Spec Delta

## MODIFIED Requirements

### Requirement: Protocol surface
The endpoint SHALL implement the streamable HTTP transport for JSON-RPC 2.0 requests in stateless mode: `initialize` (negotiating a supported protocol version and advertising `tools`, `resources` and `prompts` capabilities and the server name and version), `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/templates/list`, `resources/read`, `prompts/list` and `prompts/get`. Unknown methods SHALL return JSON-RPC error `-32601`; malformed JSON `-32700`; invalid parameters `-32602`. `GET /mcp` SHALL answer 405.

#### Scenario: Initialize
- **WHEN** a client sends `initialize` with a protocol version the server supports
- **THEN** the response echoes that version and lists `tools`, `resources` and `prompts` capabilities

#### Scenario: Unsupported protocol version
- **WHEN** a client requests a protocol version the server does not implement
- **THEN** the server answers with the latest version it supports and the client may continue or disconnect

#### Scenario: Unknown method
- **WHEN** a client calls `tasks/complete`
- **THEN** the response is a JSON-RPC error with code `-32601` and nothing changes

## ADDED Requirements

### Requirement: Skills as prompts
`prompts/list` SHALL list the built-in skills by id with their name, description and one optional argument for the user's text. `prompts/get` SHALL return the skill's instructions as messages for the client's model. Running them uses the client's own tool calls, so every read and write stays subject to the existing token scope, write switches, limits and audit. An unknown prompt name SHALL return `-32602`, and requests without a valid token SHALL be refused as for every MCP request.

#### Scenario: Weekly review from a desktop client
- **WHEN** an MCP client with an agent token gets the `weekly-review` prompt and runs it
- **THEN** its model reads tasks with the read tools and any changes it makes go through the write tools, subject to the owner's and user's write switches

#### Scenario: Read-only token
- **WHEN** a client with a read-only token runs the `triage-inbox` prompt
- **THEN** it can read tasks but every write tool call is refused as today

#### Scenario: Unknown prompt
- **WHEN** a client calls `prompts/get` with the name `delete-all`
- **THEN** the response is a JSON-RPC error with code `-32602`
