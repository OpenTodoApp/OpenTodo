# Spec Delta

## ADDED Requirements

### Requirement: Block resources for MCP Apps
For a client that announces the MCP Apps extension, a display tool call SHALL return its checked block as structured content and reference a `ui://opentodo/blocks/<kind>` resource. The resource SHALL be self-contained HTML with the block's content inlined, making no network request of its own, leaving out projects kept away from assistants. It is served only to the calling token.

#### Scenario: Tasks rendered by the host
- **WHEN** an Apps-capable client calls `show_tasks` with two task ids
- **THEN** the result references a `ui://opentodo/blocks/tasks` resource whose HTML lists both tasks with their titles and dates, and loads nothing from the network

#### Scenario: Unknown resource
- **WHEN** a client reads a `ui://opentodo/blocks/...` resource it was not given
- **THEN** the server answers a not-found error

#### Scenario: Without a token
- **WHEN** an MCP request without a token reads a block resource
- **THEN** the request is refused as unauthenticated like every MCP request
