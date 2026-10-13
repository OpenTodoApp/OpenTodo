# One-step undo of an AI assistant's changes

## Why

An assistant using an `agent` token (MCP or the `ot` CLI's REST content routes) writes directly: each write call is one batch of ops with device `agent:<token-id>`, recorded as `agent.write` in the audit log. When an assistant gets something wrong, for example a prompt-injected "reschedule everything in Finance" or a loop that created 40 duplicate tasks, the user has to repair it item by item: restore each value from history, reopen each task, trash each created task. The in-app assistant already has one-step undo of a whole applied proposal that skips fields edited by hand since (`in-app-assistant` "One-step undo"). People asked whether MCP goes through the same review screen. It does not: MCP and REST writes apply at once. This change gives those writes the same safety net after the fact: **undo one write call, or everything one assistant did in a recent period, in one step**, from Settings → AI → AI assistants or from the task's history.

## What Changes

- **Recent assistant changes.** New `GET /api/v1/me/agent-calls` lists the caller's own assistant write calls from the last 30 days, newest first, derived from the op log (one call = the ops of one `agent:<token-id>` device at one server timestamp). Each entry has the time, the token (name, or "deleted token"), the tools (from the `agent.write` audit events while they are retained), counts of created, changed, completed and trashed items, the projects touched and whether the call was already undone.
- **Undo.** New `POST /api/v1/me/agent-calls/undo` takes either a list of call ids or `{token_id, since}`, supports `dry_run`, and writes the inverse as **one** `ApplyStrict` batch followed by `NotifyApplied`. Changed fields go back to the value they would have without the undone calls. Entities the calls created go to the Trash. Tasks they trashed come back. Completions are reverted, including a recurring series and its occurrence record. Comments they added are deleted (tombstone).
- **Never overwrite later edits.** A field whose current value was written after the call by anyone else (a device, another member, another call that is not being undone) is skipped. So is an entity the caller can no longer edit (role now viewer, removed from the project, purged), and anything that would put plaintext into an encrypted account. Every skip is reported with its item and reason. A second undo of the same call writes nothing (`already_undone`).
- **Attribution.** Undo ops use the new reserved device `agent-undo:<token-id>`. History labels them "Undo of AI assistant (<token name>)" for the token's owner and "Undo of AI assistant" for other members. `/api/v1/sync` refuses the prefix like `agent:`. Each undo request adds an `agent.undo` audit event (token, number of calls, restored and skipped counts, outcome, never content). `agent.write` gains an additive `call` detail so the list can name tools.
- **Permissions.** Only the user whose token made the call, signed in with a session or a `full` token. `read` and `agent` tokens are refused with 403 `insufficient_scope`. There is no MCP tool and no agent REST route for undo, so an assistant cannot undo (or "redo" around) the user. Both routes are on the demo deny list.
- **Limits.** At most 100 calls and 500 entities per undo request, 10 undo requests per minute per user, calls older than 30 days are not offered.
- **UI.** Settings → AI → AI assistants gains "Recent changes by assistants": per token, a list of calls with **Undo** per call and **Undo all from this assistant…** (last hour, 24 hours, 7 days, 30 days). Each opens a preview (dry run) that lists what will be restored and what will be skipped. A task's history entry made by one of the user's own assistants offers **Undo this assistant change**, opening the same preview.

## Out of scope

- A review screen before MCP or REST agent writes apply (writes stay direct; this change only adds after-the-fact undo).
- Undo of in-app assistant writes (`assistant:` devices) through this route: they keep their device-local undo.
- Redo, undo of undo, and undo of any non-agent write (devices, REST with session or `full` token, CalDAV, email).
- Undo from the `ot` CLI or through MCP (see open questions in design.md).
- Undo of permanent purges (impossible by design: purged data is gone) and of anything an assistant cannot do (sharing, settings, tokens).
- Changing the op log format or adding a batch id to ops.

ROADMAP: extends the shipped "Bring your agent" item 1 (`mcp-write-tools`, "every write is ... reversible") with a one-step path, and is added as row 4 `agent-batch-undo` of that group.

**BREAKING:** none. No new environment variable, no change to the op format or to existing op fields. One new reserved device prefix (`agent-undo:`) is refused on `/api/v1/sync`; no client ever used it.

## Capabilities

### New Capabilities
- None. The work extends `mcp-server`.

### Modified Capabilities
- `mcp-server`: new requirements for listing assistant write calls, undoing them (semantics, skip rules, permissions, limits, convergence) and the "Recent changes by assistants" panel.
- `trash-and-history`: history labels undo ops and offers undo from an assistant's history entry.
- `audit-log`: "Recorded events" gains `agent.undo`.
- `demo-mode`: "Restricted features" names undoing assistant changes.

## Impact

- Server: `internal/agenttools` (new `undo.go`: call listing, inverse planning, skip rules, limiter), `internal/sync` (field-winner and previous-value lookups over the op log, `AgentUndoDevice`, reserved prefix, a field-default table), `internal/httpapi` (two routes, history label and `call_id`, demo rule), `internal/audit` (`agent.undo`, `call` detail on `agent.write`).
- Data: migration with one partial index on `ops` for agent devices and one side table `agent_call_undos` (server state, not synced, not exported). No op field changes.
- Client: `web/src/app/AssistantsPanel.tsx` (panel and preview dialog), `web/src/lib/api.ts`, `web/src/lib/history.ts` (label, undo link).
- Docs: `docs/mcp.md` "History, audit and undo", `docs/ai-and-agents.md`, `docs/api.md`, `docs/trash-and-history.md`.
- Size: no new dependency. Server binary under +60 KB, web main chunk under +3 KB gzipped (design.md "Size and memory").
