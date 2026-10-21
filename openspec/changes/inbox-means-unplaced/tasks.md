# Tasks

## 1. One Inbox predicate

- [ ] 1.1 Confirm with the maintainer the definition of "scheduled" in design D1 (due, start date or Someday; deadline alone does not count) before writing code; record the answer in design.md
- [ ] 1.2 Add `internal/inbox` with `IsTask` and the shared vectors `internal/inbox/testdata/inbox_vectors.json` (open/completed/deleted, project or not, due, start date past and future, someday, deadline only, reminder only); `go test ./internal/inbox/...` passes
- [ ] 1.3 Add `isInboxTask` in `web/src/lib/inbox.ts` reading the same vectors in a vitest test; `cd web && npm test -- inbox` passes
- [ ] 1.4 Add a test that fails when `project_id` null is used as an Inbox test outside the helpers in the files named in design D2; it passes after group 2

## 2. Every Inbox reader uses it

- [ ] 2.1 Web lists and counts: Inbox view, sidebar and tab bar counts, the Process control (`views.ts`, `listGroups.ts`, `useListModel.ts`, `Sidebar.tsx`, `TabBar.tsx`, `ListChrome.tsx`); list tests cover "Scheduling takes a task out of the Inbox", "Clearing the date brings it back", "A deadline alone does not schedule", "Inbox count follows scheduling"; `npm test` passes
- [ ] 2.2 Open Loops pulse, Daily check and weekly review Get clear count Inbox tasks with the helper; their tests assert a scheduled project-less task is not counted; `npm test -- pulse review rhythms` passes
- [ ] 2.3 Go readers: `list_tasks` view `inbox`, `today_summary`, `opentodo://views/inbox`, `ot inbox`/`ot list --inbox`, the assistant's Inbox view; tool descriptions updated and the golden files regenerated; tests for "Inbox view leaves out planned tasks" and "Inbox leaves out planned tasks"; `go test ./...` passes
- [ ] 2.4 Convergence test: two offline devices (start date on one, move to a project on the other) end with the task in the project and not in the Inbox (`npm test -- sync` scenario added)

## 3. Nothing becomes unreachable

- [ ] 3.1 Remove the Inbox Later group; list a deferred project-less task without a due date in Upcoming under its start date with the "Starts" chip; update `start-dates` tests ("Deferred until next week") and confirm project views keep their Later group; `npm test -- startDates upcoming` passes
- [ ] 3.2 The planned-tasks line under the Inbox header ("N planned tasks without a project", hidden at zero) opening Filter with `no project`; test "Where planned tasks went"; layout check passes at 360/390/768 px (`make layout-check` or CI)
- [ ] 3.3 Quick add in the Inbox announces where a scheduled task went with an Open control; test "Quick add with a date in the Inbox"
- [ ] 3.4 Project pickers show "No project" with the inbox icon and the keyword "inbox"; test "No project found by typing inbox"; update the MCP move tool description wording and golden files
- [ ] 3.5 Docs: `docs/today-and-upcoming.md` and `docs/deadlines-and-start-dates.md` explain the rule and where planned tasks are; `docs/cli.md` and `docs/mcp.md` updated; `make docs` and `make docs-check` pass

## 4. Scheduling sheet in Process the Inbox

- [ ] 4.1 `relativeDoOn(deadline, today)` with month clamping and past choices removed, unit-tested with "A week before the deadline", "Choices in the past are left out", "Month without the day"; `npm test -- relativeDoOn` passes
- [ ] 4.2 The sheet for `s`: relative row (keys `1`–`6`, registered in the triage scope), Do on quick choices, worded date field with preview, visible calendar with the deadline marked, bottom sheet below 768 px; interaction tests for "No deadline", "Cancel", "User's date format" (month-day) and "Offline"; the shortcut registry conflict test passes
- [ ] 4.3 Queue stability: decided tasks stay counted, outside changes still remove tasks; tests "Scheduling keeps the count stable" and the existing "A task arrives from another device" / "The current task is moved elsewhere"; `npm test -- triage` passes
- [ ] 4.4 `t` and every schedule decision take the task out of the Inbox; live region announces the date in the user's date format; update `docs/process-the-inbox.md` with the sheet and its keys; `make docs-check` passes
- [ ] 4.5 Translations for every new string in the five catalogs; `node scripts/i18n-check.mjs` passes

## 5. Illustrations

- [ ] 5.1 `illustration` slot in `ui/patterns/EmptyState.tsx` and `web/src/ui/illustrations/InboxZero.tsx` (tokens only, `aria-hidden`, ≤4 KB, 160×120 box), stories in light and dark; `make ui-check` passes with new baselines from `make ui-baselines` or the CI artifact
- [ ] 5.2 `make ui-lint` rejects hex colours, `<image>` and files over 4 KB under `web/src/ui/illustrations/` (test with a bad fixture); "Style gate" scenario
- [ ] 5.3 Use the illustration in the empty Inbox view and the triage Inbox zero state; screen-reader test that only the heading and action are announced; `docs/design-system.md` gains the illustration rules
- [ ] 5.4 `cd web && npm test && npm run build`, `go test ./...` and `make check` pass; CHANGELOG entry under Changed stating the new Inbox rule plainly
