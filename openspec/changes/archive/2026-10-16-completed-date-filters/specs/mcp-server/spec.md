# Spec Delta

## ADDED Requirements

### Requirement: Completion range in list_tasks
`list_tasks` SHALL accept `completed_after` and `completed_before` (a `YYYY-MM-DD` date at the start of that day in the call's `timezone`, an RFC 3339 time or Unix milliseconds) and with either SHALL list only tasks completed in `[completed_after, completed_before)`, from synced data. Results SHALL carry `completed_at` and `completed_by`. The tool stays read-only; encrypted accounts get the same tasks with titles marked as encrypted.

#### Scenario: Last week for an assistant
- **WHEN** an assistant calls `list_tasks` with `completed_after: "2026-10-05"`, `completed_before: "2026-10-12"` and `timezone: "America/New_York"`
- **THEN** the result lists the tasks completed in that week in New York time, and no open task

#### Scenario: Invalid argument
- **WHEN** `list_tasks` is called with `completed_after: "yesterday"`
- **THEN** the response is a JSON-RPC `-32602` error naming `completed_after`

#### Scenario: No token
- **WHEN** a client calls `list_tasks` without a token
- **THEN** the request is refused with 401 like every MCP call
