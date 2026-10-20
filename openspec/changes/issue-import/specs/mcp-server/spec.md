# Spec Delta

## ADDED Requirements

### Requirement: Issue connections resource
`resources/list` SHALL also expose `opentodo://integrations/issues`, read-only, with the user's issue connections (OpenSpec `issue-connections`) as JSON: id, name, provider, host, state, the last poll and its counts, the task count and `token_set`, never a token. With the owner switch for issue connections off the resource SHALL be listed and read as an empty list with `enabled: false`. The MCP server SHALL make no request to a provider; it reads the stored state only.

#### Scenario: Read the resource
- **WHEN** an assistant reads `opentodo://integrations/issues` for a user with one connection
- **THEN** the content lists that connection with its state and `token_set: true` and contains no token

#### Scenario: Feature off
- **WHEN** the owner has not enabled issue connections and an assistant reads the resource
- **THEN** the content is `{"enabled": false, "connections": []}`

#### Scenario: No outbound request
- **WHEN** an assistant reads the resource while the server's outbound traffic is inspected
- **THEN** the server makes no outbound request
