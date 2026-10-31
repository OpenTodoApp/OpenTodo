# Design

## Context

The agent surface is one registry (`internal/agenttools`): MCP calls its tools directly, and an `agent` token's REST write on a fixed route list is translated by `internal/httpapi/agent_rest.go` into calls of the same tools, run as one write call (one gate check, one count against the per-minute limit, one `ApplyStrict` batch with device `agent:<token-id>`, one `agent.write` audit event per tool). The route list fails closed: `agentRoute` decides by the matched mux pattern, so a route is refused until it is added on purpose.

What #565 asks, checked against `main`:

| # | Ask | MCP today | Agent REST today |
| --- | --- | --- | --- |
| 1 | Reminders | none | refused (`/api/v1/reminders` not on the list) |
| 2 | Project note | `description` is an unknown argument of `update_project` | `PATCH /projects/{id}`: `name`, `color` only |
| 3 | Sections | `create_sections`, `update_sections`, `reorder_sections` exist | refused |
| 4 | Field values | `fields` on `create_tasks`/`update_tasks` | in the spec's list (`account-access` "Agent content routes"), missing from `taskCreateFields` and the PATCH switch: a bug |
| 5 | Project parent, archive | `parent_id` yes; archive refused by design | `parent_id`, `icon`, `archived` refused |
| 6 | Label rename/recolour | `create_label` only | `POST /labels` only |
| 7 | Time entries | `list_time_entries` (read) | every write refuses `agent` |
| 8 | Running Focus session | — | — (change `focus-session-readable`) |

## Goals / Non-Goals

**Goals:** close items 1–7 on both surfaces, with the same switches, limits, audit, exclusions, roles and E2EE behaviour as every agent write; write nothing outside the op log; keep the tool count small.

**Non-Goals:** destructive tools (purge, delete projects/sections/labels/fields, delete time entries), field definitions, assignment, sharing; item 8.

## Decisions

**D1. Every new ability is a tool first; REST maps to it.** The REST routes stay thin translations (`agent_rest.go`), so validation, limits and audit cannot drift between MCP and REST. Alternative: let agent tokens reach the regular handlers for these routes with a scope check — rejected, it would give REST its own validation and lose the registry's limits, E2EE refusal and attribution.

**D2. Reminders: three tools over the existing entity, firing time computed by the server.**
- `add_reminders` `{items: [{task_id, kind, offset_minutes?, at?, id?}]}` with `kind` one of `relative` (`offset_minutes` ≤ 0, minutes before the due time; 0 is "at due time"), `deadline` (`offset_minutes` ≤ 0, before 09:00 on the deadline day) or `absolute` (`at`: `{date, time, tz?}`, a floating moment read in `tz` or the user's time zone). Returns the reminders with `fire_at`.
- `update_reminders` `{updates: [{id, offset_minutes?, at?}]}`: kind is fixed; changing the kind is a remove and an add.
- `remove_reminders` `{ids}`: writes `deleted_at`, like deleting it in the task panel.
- `fire_at` for `relative` and `deadline` is computed exactly as `POST /api/v1/reminders` computes it today (`zoned.RelativeFireAt` in the user's time zone, 09:00 for a date-only due); a task without a due date (relative) or deadline (deadline) gets a reminder with no firing time, which the `reminders` spec already handles ("Due date cleared", "Deadline cleared").
- Reminders are personal (`internal/sync/scope.go`): the tools read and write only the token user's reminders, on any task the user can read — a viewer of a shared project may set a reminder for themselves, as in the app, and nobody else sees it. An id of another user's reminder is `not_found`.
- At most 10 live reminders per task through these tools (`invalid` beyond), so a looping agent cannot fill a task with alerts; the app sets no such limit and is unaffected.
- Removal is allowed on any of the user's reminders, not only the token's own creations (unlike `trash_tasks`): a reminder is the user's own alert, not shared content, history shows it as "AI assistant (name)" and restoring it is one history action. Alternative considered: own creations only, which would leave the asker's "change the 10:00 alert to 09:45" half-done whenever the person made the reminder.
- `get_task` gains `reminders: [{id, kind, offset_minutes, fire_at, dismissed}]` (the caller's own, live), so an agent can change what exists. Reminders carry no user-written text, so nothing changes for encrypted accounts.

**D3. Project note: replace or append, never the document.** `update_project` accepts `description` (the whole Markdown note, ≤ the REST limit of `rich-text-editing`) and `append_description` (Markdown added after a blank line to the current note; at most one of the two per update). The tools never write `notes_doc`: a device folds the new `description` into the document by the existing rule ("Plain-text write folds in"), so concurrent edits converge under `rich-text-editing`. `append_description` is planned against the stored description, so it needs plaintext: for an encrypted account it works only through an opted-in device (the device appends and encrypts) and is `encryption_enabled` otherwise; `description` accepts a ciphertext envelope like every content argument. Editors may write the note (the role table already allows `description` for editors, `internal/sync/scope.go`); viewers get `forbidden`. Alternative: a separate `update_project_note` tool — rejected, one more tool for the same entity, and the agent REST mapping (`PATCH … {"description"}`) is simpler with one.

**D4. Archive is its own tool, one project per call.** `mcp-server` "Write tools" says no tool archives; that rule protected against an agent hiding a project's tasks. Archiving is reversible and the issue asks for it, so it becomes `archive_projects` `{id, archived}`: `true` archives the project and its descendants (one op per project, as `project-organization` "Archive a project" requires), `false` unarchives that project alone. One project per call keeps the effect readable in the audit log and history; the count against limits is the number of projects written. Admin or owner role only, as in the app; editors and viewers get `forbidden`. Alternative: `archived` on `update_project` — rejected, it would make an ordinary rename call able to hide a whole tree. REST `PATCH /projects/{id}` with `archived` maps to this tool and may not carry other fields in the same request (400 `invalid_input`: "archive on its own").

**D5. Labels: `update_labels` mirrors `update_sections`.** `{updates: [{id, name?, color?, position?}]}`. A rename is one op on the label, never on tasks (`labels` "Rename, recolour and reorder"). A name equal (ignoring case) to another live label of the same workspace is `invalid`, the creating-device rule of `labels` "Label entity". Labels are personal, so only the user's own; `name` is a content field (ciphertext only without an opted-in device). No delete and no merge.

**D6. Time entries: start, stop, log and edit, never delete, never a silent stop.**
- `start_timer` `{task_id, stop_running?}` starts a running entry for the token's user with `device_id: agent:<token-id>`. If another entry of the user runs, it is refused with `timer_running` (naming the running entry's task when readable) unless `stop_running: true`, which ends it at the new start in the same batch (`time-tracking` "One running entry per user"). This protects a Focus session the person runs: without the flag the agent cannot end it by accident; with it, the Focus screen shows "stopped elsewhere" as for any other device.
- `stop_timer` `{}` stops the user's running entry (`not_found` when none).
- `log_time` `{items: [{task_id, started_at, ended_at, note?}]}` logs closed entries (end after start, at most 24 hours each, not in the future beyond one minute of skew).
- `update_time_entries` `{updates: [{id, started_at?, ended_at?, note?}]}` only for entries the same token created, like `trash_tasks`; another entry is `not_permitted`. The person's own tracked time is never rewritten by an agent.
- No delete tool and no `DELETE /api/v1/time-entries/{id}` for agent tokens.
- Viewers cannot track (as in the app): `forbidden`. `note` is a content field.
- REST: `POST /api/v1/time-entries` maps to `start_timer` (`{taskId}`, plus `stopRunning`) or `log_time` (`{taskId, startedAt, endedAt, note?}`); `POST /api/v1/time-entries/stop` to `stop_timer`; `PATCH /api/v1/time-entries/{id}` to `update_time_entries`. The REST bodies keep the camelCase names the routes use today.
- Alternative: keep time entries read-only for agents (the original `time-tracking` decision). Rejected because the issue's workflow (logging a Pomodoro worked beside the person) is exactly what the scope is for, and the guard in the first bullet keeps the risk the original decision worried about.

**D7. Sections, project parent and icon, and fields on REST only map existing tools.** `POST /api/v1/sections` → `create_sections` (one item), `PATCH /api/v1/sections/{id}` → `update_sections` (name, color, icon, position); `PATCH /api/v1/projects/{id}` adds `parent_id`, `icon` (→ `update_project`) and `description`. `fields` is added to `taskCreateFields` and the PATCH switch (→ `fields` of `create_tasks`/`update_tasks`). `DELETE /api/v1/sections/{id}` stays refused.

**D8. Gate, limits, exclusions, audit: unchanged and shared.** Every new tool is `KindWrite` and passes `Caller.WriteDenial`; counts are the entities written (reminders, labels, projects including archived descendants, entries). Entities of a project kept away from assistants (`agent-project-exclusion`), including reminders and time entries of its tasks, are `not_found`. `agent.write` records the tool name and count only. The `tools/list` for a `read` token, or a token whose switches are off, keeps omitting every write tool.

**D9. Progressive disclosure.** Nothing new in the app. Settings → Integrations → AI assistants keeps its two switches; `docs/mcp.md` and `docs/api.md` list the new tools and routes. Simple-list users see nothing new; a reminder or label an agent writes looks exactly like one they wrote, with "AI assistant (name)" in history.

## Data model impact

None. No new entity, field or migration. Writes use `reminder`, `project.description`, `project.archived`, `label`, `section`, task `fields.<id>` and `time_entry` fields that exist. `time_entry.device_id` takes the value `agent:<token-id>`, as for any device.

## Size

No dependency. Server binary grows by a few hundred lines of Go; no web bundle or image change; no runtime memory change.

## Risks

- **An agent archives a project the person is using.** Mitigation: admin role, one project per call, `project.archived` webhook, history, and unarchive is one tool call or one click.
- **An agent rewrites a long project note.** Mitigation: `append_description` for the log-style use, history keeps the previous Markdown, and `docs/mcp.md` tells skill authors to prefer appending.
- **Timer tug of war between an agent and the person.** Mitigation: D6's `timer_running` refusal by default.
