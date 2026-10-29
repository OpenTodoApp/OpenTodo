# Tasks

Backend tasks are verified with `go test ./...`; there is no web change, so `npm test` and `npm run build` in `web/` only need to stay green. `make check` runs before the last task.

## 1. Field values on REST (the bug first)

- [ ] 1.1 Add `fields` to `taskCreateFields` and to the PATCH switch in `internal/httpapi/agent_rest.go`, passed to `create_tasks`/`update_tasks`. Verified by a new `agent_rest_test.go` case: an agent POST and PATCH with `{"fields":{"<cost-id>":120}}` answer 201/200 with the value, a value of the wrong type answers 400 `invalid_input` naming the field, and a field of another project answers 400.

## 2. Reminders

- [ ] 2.1 `internal/agenttools/write_reminders.go`: `add_reminders`, `update_reminders`, `remove_reminders` with the D2 argument shapes, `fire_at` through `zoned.RelativeFireAt` in the user's zone (shared with `internal/httpapi/push.go`, moved to a helper both call), the personal-only rule, the 10-live-reminders cap, counts per reminder. Verified by `agenttools` tests: relative at 0 and −30, deadline −1440, absolute with and without `tz`, undated task (no `fire_at`), another user's reminder `not_found`, viewer of a shared project allowed, 11th reminder `invalid`, excluded project `not_found`.
- [ ] 2.2 `get_task` and `opentodo://tasks/{id}` return the caller's live reminders. Verified by a `read_test.go` case with the caller's two reminders and another member's one.
- [ ] 2.3 Agent REST: `POST /api/v1/reminders`, `PATCH /api/v1/reminders/{id}`, `DELETE /api/v1/reminders/{id}` in `agentRoute`, mapped to the three tools. Verified by `agent_rest_test.go` (201 with `fire_at`, 404 on a foreign id, 403 `writes_disabled_by_user` with the switch off).

## 3. Projects: note, parent, icon, archive

- [ ] 3.1 `update_project` accepts `description` and `append_description` (one of the two, `rich-text-editing` length limits; editors allowed; viewers `forbidden`); never writes `notes_doc`. Verified by tests: replace, append to an empty and a non-empty note, both at once `-32602`, viewer `forbidden`, editor allowed.
- [ ] 3.2 `archive_projects` tool (D4): descendants archived one op each, unarchive alone, admin/owner only, count = projects written. Verified by tests on a three-level tree, an editor `forbidden`, and the webhook test that one `project.archived` event is derived per project.
- [ ] 3.3 Agent REST `PATCH /api/v1/projects/{id}` accepts `icon`, `parent_id`, `description` (→ `update_project`) and `archived` alone (→ `archive_projects`; with another field 400 `invalid_input`). Verified by `agent_rest_test.go`.

## 4. Sections and labels over REST, label tool

- [ ] 4.1 `POST /api/v1/sections` → `create_sections`, `PATCH /api/v1/sections/{id}` → `update_sections`; `DELETE` stays 403. Verified by `agent_rest_test.go`.
- [ ] 4.2 `update_labels` tool (D5) and `PATCH /api/v1/labels/{id}`: rename, recolour, position; duplicate name in the workspace `invalid`; one op per label and none on tasks. Verified by tests counting the ops of a rename with 40 tagged tasks.

## 5. Time entries

- [ ] 5.1 `internal/agenttools/write_time.go`: `start_timer` (with `timer_running` and `stop_running`), `stop_timer`, `log_time` (bounds of D6), `update_time_entries` (same-token entries only, `not_permitted` otherwise), device `agent:<token-id>`, viewers `forbidden`, the one-running-entry rule through `internal/timetrack`. Verified by tests for each scenario of `mcp-server` "Time entry write tools".
- [ ] 5.2 The time-entry routes accept `agent` tokens through the registry (`POST` start/log, `POST …/stop`, `PATCH`), 409 `timer_running` unless `stopRunning`, `DELETE` 403. Verified by `time_entries_test.go` and `agent_rest_test.go`.

## 6. Encryption, gate and listing

- [ ] 6.1 Mark the new content arguments (`description`, `append_description`, label `name`, entry `note`) as `ContentFields`; `append_description` refused with `encryption_enabled` without an opted-in device and planned on the device through the relay when one is. Verified by `encrypted.go` tests and a `relay_test.go` case appending through a fake device.
- [ ] 6.2 `tools/list` lists the new tools only when `CanWrite()`; `policy_test.go` and the agent route test (the fail-closed list) updated on purpose. Verified by `internal/mcp` tests with a `read` token, switches off and a permitted `agent` token.

## 7. Documentation

- [ ] 7.1 `docs/api.md`: the agent-token route table (new routes and fields, `fields` on tasks), the refusals table (`timer_running`), the time-entry rows ("not `agent`" removed for start, stop and PATCH), and the route matrix. Verified by `npm run docs:check`.
- [ ] 7.2 `docs/mcp.md`: the new tools with their arguments and examples, the `update_project` note arguments, the line "no tool archives…" replaced, and the encrypted-account notes. Verified by `npm run docs:check`.
- [ ] 7.3 `skills/opentodo-mcp/SKILL.md` and `skills/opentodo-cli` text: when to append to a note, never to take over a running timer without asking. Verified by `go test ./skills/...` (the skill tests) and `npm run docs:check`.
- [ ] 7.4 No UI string changes: the app's assistant settings do not enumerate tools. Verified by `make i18n-check` passing unchanged.
- [ ] 7.5 CHANGELOG entry under Unreleased (at apply time). Verified by `make check`.
- [ ] 7.6 `make check` passes.
