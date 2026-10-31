# Proposal

## Why

An assistant that plans the day through an `agent` token (Claude Code over REST and MCP, issue #565) creates and schedules tasks well, but hands back to the person everything around them: a 10:00 block cannot get a reminder, a client's project note cannot be kept current, sections and project moves are MCP-only, field values are refused on REST although the spec promises them, projects cannot be archived, labels cannot be renamed, and time worked beside the person cannot be logged. The `agent` scope exists so the person keeps its limits, audit labels and switches; today the only way past these gaps is a `full` token, which gives all of that up. The research's "agent-native" section makes the same point: the planner is only as useful as the smallest thing it cannot finish.

This change completes the agent tool set for items 1 to 7 of #565. Item 8 (the running Focus session, readable from outside) touches the rule that the timer never leaves the device, so it is its own change, `focus-session-readable`.

## What Changes

- **Reminders.** New write tools `add_reminders`, `update_reminders` and `remove_reminders` (at the due time or a number of minutes before it, a number of minutes before the deadline, or at a fixed moment); `get_task` returns the caller's own reminders of the task. Agent REST: `POST /api/v1/reminders`, `PATCH /api/v1/reminders/{id}`, `DELETE /api/v1/reminders/{id}`.
- **Project notes.** `update_project` accepts `description` (replace the note) and `append_description` (add a block at the end); agent REST `PATCH /api/v1/projects/{id}` accepts `description`. Editors may write the note, as in the app.
- **Sections over REST.** `POST /api/v1/sections` and `PATCH /api/v1/sections/{id}` join the agent content routes, mapped to the existing `create_sections` and `update_sections` tools.
- **Custom field values over REST.** `fields` on `POST /api/v1/tasks` and `PATCH /api/v1/tasks/{id}` for agent tokens, which `account-access` "Agent content routes" already lists but the server refuses today (a bug, fixed here, plus the missing row in `docs/api.md`).
- **Projects.** Agent REST `PATCH /api/v1/projects/{id}` accepts `parent_id` and `icon` (the tool already does); a new tool `archive_projects` archives (with the sub-projects, as in the app) or unarchives one project at a time, mapped from `PATCH … {"archived": true|false}`.
- **Labels.** A new tool `update_labels` renames, recolours and reorders labels; agent REST `PATCH /api/v1/labels/{id}`.
- **Time entries.** New tools `start_timer`, `stop_timer`, `log_time` and `update_time_entries`; the four `/api/v1/time-entries` write routes accept `agent` tokens through the registry. Starting never silently stops a timer the person runs: it is refused with `timer_running` unless the call says `stop_running: true`.
- Everything stays behind the owner's `mcp.writes` switch and the user's "Allow AI assistants to make changes", the per-token limits (30 write calls a minute, 1,000 changed items a day, 50 per call), the `agent.write` audit event, projects kept away from assistants, the roles of shared projects and the end-to-end encryption rules. Writes go through `ApplyStrict` with device `agent:<token-id>`.

No new op field, no migration, no new environment variable. Not **BREAKING**: every addition is a tool or an accepted field that answered `-32602` or 403 `insufficient_scope` before.

## Out of scope

- The running Focus session as an API or event (#565 item 8): change `focus-session-readable`.
- Deleting or purging projects, sections, labels or custom field definitions; creating or deleting field definitions; assigning people; members and sharing. They stay refused, as `mcp-server` "Write tools" says.
- Deleting time entries (only a person removes tracked time) and editing time entries another member wrote.
- A default reminder for tasks with a Do time (#546): a separate change; this one lets the agent add one per task.
- Webhook events for reminders, labels or time entries.

ROADMAP: milestone 0.20 "Everywhere", row `agent-tools-complete`. Relates to the anti-roadmap rule "Every feature works offline, on encrypted accounts and through the API, CLI and MCP".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: "Write tools" lists the new tools and lets `update_project` write the note and archive through its own tool; "Encrypted accounts and write tools" names the new content arguments; new requirements for reminders, labels, time entries and project notes in write tools.
- `account-access`: "Agent content routes" grows by the reminder, section, label and time-entry routes and the new project fields.
- `time-tracking`: "Time entry write routes" accepts `agent` tokens through the registry (deletion stays refused).

## Impact

- **Code:** `internal/agenttools` (new `write_reminders.go`, `write_time.go`, label and archive planning, `update_project` note arguments, `get_task` reminders), `internal/httpapi/agent_rest.go` (new routes in `agentRoute`, the field lists), `internal/mcp` (tool list), `docs/api.md`, `docs/mcp.md`, the `opentodo` agent skill (`skills/`) and the Claude plugin's skill text.
- **Data model and sync:** none. Reminders, labels, projects, sections, field values and time entries are written with fields that exist; relative and deadline reminders get the firing time the REST path computes today, in the user's time zone.
- **E2EE:** the new content arguments are `description`/`append_description` (project) and `note` (time entry); `name` of a label was content already. For an encrypted account without an opted-in device they take ciphertext envelopes only, or `encryption_enabled`; through an opted-in device they are encrypted there (`mcp-server` "Content through an opted-in device"). `append_description` needs the plaintext note, so without a device it is refused with `encryption_enabled`.
- **API/CLI/MCP:** new tools in `tools/list`, new agent content routes, the route matrix in `docs/api.md`. The `ot` CLI needs nothing new: it already calls the REST routes, which now accept agent tokens.
- **CalDAV and vault:** none; reminders written by an agent reach CalDAV clients as alarms like any reminder.
- **Size:** no dependency; a few hundred lines of Go. No web bundle change.

Fixes #565 (items 1–7)
Relates to #546
