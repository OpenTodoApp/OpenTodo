# Proposal

## Why

Issue #1977: `create_tasks` and `update_tasks` have no assignee field, so an assistant connected over MCP cannot assign a task in a shared project or change who it is assigned to. People label tasks with a name instead. The app, REST and the command-line client all assign; the task view over MCP already shows `assignee_id` and the assignee's name.

## What Changes

- `create_tasks` items and `update_tasks` updates take `assignee`: a member of the task's shared project named by account id, email or name (ignoring case), or `me`; `null` unassigns. In the Inbox or an unshared project only the user (`me` or their id) can be assigned, as on REST.
- The checks are REST's: someone who is not a current member of the task's project is refused and nothing is written, a viewer is refused with `forbidden`, and the written `assignee_id` operation is checked again by the sync path at receipt.
- The assignment is one ordinary `assignee_id` operation: it notifies the assignee as any assignment does, works for devices that are offline (they apply it on their next sync) and converges by last-writer-wins.
- The "No tool SHALL … assign people" clause of `mcp-server` "Write tools" goes.
- No new op field, route, setting, environment variable or dependency. Not **BREAKING**.

Out of scope: listing a project's members over MCP (a name or email the user gives is enough), the `agent` token's REST routes (which keep refusing `assignee_id`, `account-access`), and changing the assignee through routines.

Roadmap: a fix for an existing capability; no ROADMAP.md item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: "Write tools" no longer excludes assigning; new requirement "Assignee in write tools".

## Impact

- Go: `internal/agenttools` (`write_assignee.go`, `write_tasks.go`, `write.go`, the member rows in `data.go`), tool golden files.
- Docs: `docs/mcp.md`, `skills/opentodo-mcp/SKILL.md` and its plugin copy.
- Tests: `internal/agenttools/assignee_test.go`.
