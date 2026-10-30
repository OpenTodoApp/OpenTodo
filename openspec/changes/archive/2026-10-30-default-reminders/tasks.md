# Tasks

## 1. Preferences

- [x] 1.1 Add `reminder_default_timed` and `reminder_default_dated` (string, default `""`) to `user_prefs` in `internal/sync/ops.go` with a comment, regenerate the op schema for `web/src/lib/types.ts`, add the defaults to `USER_PREFS_DEFAULTS` in `web/src/lib/ops.ts`, update `internal/sync/testdata/schema_fixture.json`; verify `go test ./internal/sync/...` and `npm test -- schemaFixture`
- [x] 1.2 Add `readDefaultReminders(row)` (empty, malformed or out of range → none, stored value kept) to `web/src/lib/userPrefs.ts`; verify in `web/src/lib/prefs.test.ts`

## 2. Shared rule

- [x] 2.1 Write `web/src/lib/defaultReminder.vectors.json` covering design D3 (each condition alone blocking), D4 (name-based id, tombstoned id blocks), D5 (date↔time switch, edited offset untouched, missing new default) and date-only firing at 09:00 in a fixed zone
- [x] 2.2 Implement `defaultReminderChanges` in `web/src/lib/defaultReminder.ts`; verify `web/src/lib/defaultReminder.test.ts` passes every vector
- [x] 2.3 Implement `internal/defaultreminder` (leaf: `zoned`, `ids`) with `Plan`; verify `internal/defaultreminder/defaultreminder_test.go` passes the same vectors with `go test ./internal/defaultreminder/...`

## 3. Web app

- [x] 3.1 Call `defaultReminderChanges` in `mutateMany` (`web/src/lib/ops.ts`) next to `reminderFollowUps`, skipping restorative batches (undo, redo, version and Trash restore) and pulled ops; verify in `web/src/lib/ops.test.ts` and `web/src/lib/reminders.test.ts`: schedule, create with due, quick-add reminder wins, reschedule adds nothing, Undo removes it, bulk Set date on three undated tasks adds three
- [x] 3.2 Verify convergence: two devices schedule the same task offline → one reminder (`web/src/lib/sync.test.ts`); a shared-project member's write gives no reminder to others
- [x] 3.3 Add the "Default reminders" card to Settings → Notifications (`notifications/push`, outside the demo-disabled block) with the two selects, presets, Custom… reusing the reminder offset editor, and the help line; register it in settings search; verify with a happy-dom test that a choice writes the op and survives a reload, and `make ui-check`

## 4. Server, CLI, agents, extension

- [x] 4.1 Parse `default_reminder` on `POST /api/v1/tasks` and `PATCH /api/v1/tasks/{id}` (`internal/httpapi/collections.go`), 400 with the error envelope on any other value, and add `defaultreminder.Plan` ops to the same `ApplyStrict` batch using `tzLocation`; verify in `internal/httpapi/reminders_test.go`: with and without the flag, invalid value, 401 without auth, read token refused
- [x] 4.2 Apply the rule in the agent tools' `ExtraOps` for `create_tasks`, `schedule_tasks` and any tool that sets `due`; verify in `internal/agenttools` tests that the reminder is in the planned change set with device `agent:<token-id>`
- [x] 4.3 Send `default_reminder=true` from `ot add` and `ot edit` unless `--no-default-reminder` or `--remind`, add the flag to the help text and `internal/cli/commands.go`; verify CLI tests against the test server
- [x] 4.4 Send the flag from the browser extension's `extension/api.js`; verify `make test-extension`
- [x] 4.5 Assert that CalDAV PUT, the importer, calendar sync and email capture add no reminder with a default set; verify with one test each in their packages, then `go test ./...`

## 5. Strings and docs

- [x] 5.1 Extract and translate the new strings in the five other languages; verify `make i18n-check`
- [x] 5.2 Document default reminders in `docs/reminders.md` and `docs/task-reminders.md` (where to set them, when they are added, once per task, which writers apply them), the query parameter in `docs/api.md`, the CLI flag in `docs/cli.md`, and the agent behaviour in `docs/mcp.md`; verify `make docs-check`
- [x] 5.3 Run `make check`; add the CHANGELOG entry under Unreleased when archiving

## Notes from implementation

- 3.1/3.2: the flow tests are in `web/src/lib/reminders.test.ts` (schedule, create, quick-add wins, reschedule, kind switch, habits and restores, Undo, bulk Set date) and `web/src/lib/sync.test.ts` (offline convergence, shared project); the settings card test is `web/src/app/defaultReminders.test.tsx`.
- 4.1/4.2: the REST, agent-tool and CalDAV tests are in `internal/httpapi/default_reminder_test.go`; the agent hook lives in `internal/httpapi` (the `ExtraOps` of the MCP registry), so it is tested there through `create_tasks` and `schedule_tasks`.
- 4.5: CalDAV (`internal/httpapi`), the importer, calendar sync and email each have a test; `internal/defaultreminder` also checks that none of the writers that must not apply the rule refer to it.
- 5.2: the user guide is its own page, `docs/default-reminders.md` (a guide page stays under 600 words), linked from `docs/task-reminders.md`, `docs/reminders.md`, `docs/settings.md`, `docs/api.md`, `docs/cli.md` and `docs/mcp.md`.
