# Spec Delta

## ADDED Requirements

### Requirement: Find free time
The registry SHALL offer the read tool `find_free_time` with `from`, `to` (at most 14 days apart), `min_minutes` and `timezone`. It SHALL return the free slots of each day within the user's working day, after removing calendar events, frames, slots and timed tasks, leaving out projects kept away from assistants. It is listed and callable like the other read tools, for MCP clients and the in-app assistant.

#### Scenario: Free slots over MCP
- **WHEN** an MCP client with a read token calls `find_free_time` for tomorrow with `min_minutes` 60
- **THEN** the result lists tomorrow's free slots of at least an hour, each with start, end and minutes

#### Scenario: Range too long
- **WHEN** a caller asks for a range of 30 days
- **THEN** the tool returns an `invalid_arguments` error naming the 14-day limit

#### Scenario: Without a token
- **WHEN** an MCP request without a token calls `find_free_time`
- **THEN** the request is refused as unauthenticated like every MCP request
