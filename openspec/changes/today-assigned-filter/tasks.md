# Tasks

## 1. Preference

- [x] 1.1 Add additive `user_prefs.today_assignees` (`""` or `mine`) in `internal/sync/ops.go` and the client prefs type. Empty and unknown read as off and are not rewritten. Verified by the existing schema fixture staying green under `go test ./internal/sync/...` and by a case next to `todayEventsShown` in `web/src/app/todayAgenda.test.tsx`.
- [x] 1.2 Read and write it the way `today_events` is read and written: one op, local first. Verified by `web/src/app/todayAgenda.test.tsx` (the outbox records `today_assignees`).

## 2. Assignee terms

- [x] 2.1 Accept `assigned`, `unassigned`, `!assigned`, `assigned: me` and `assigned: name` in `web/src/lib/filter/parse.ts` and `internal/filter/filter.go`. `assigned:` with no value is an error. `assigned` is reserved. Verified by `web/src/lib/filter/filter.test.ts` and `go test ./internal/filter/`.
- [x] 2.2 Evaluate them from the local assignee and the membership cache, and from the viewer's id and the member directory on the server. An unknown name matches nothing and warns; two members with the same name both match. Add the cases to `web/src/lib/filter/evaluate.vectors.json`. Verified by `web/src/lib/filter/evaluate.vectors.test.ts` and `go test ./internal/filter/` listing the same tasks.
- [x] 2.3 Add an Assignee condition to the condition builder (Me, Unassigned, known members) that writes `assigned: me`, `unassigned` or `assigned: "Name"`. Verified by `web/src/lib/filter/builder.test.ts`.
- [x] 2.4 Document the terms in `docs/filters.md` and refresh the in-app help with `npm run docs:build` in `web/`. Verified by `npm run docs:check` in `web/`.

## 3. Today

- [x] 3.1 A predicate that drops a shared-project task assigned to someone else only when the option is `mine`. `inToday` stays the date rule. Verified by a case in `web/src/lib/dayLists.test.ts`: off lists the task, on drops it, an unassigned task and a personal task stay, Upcoming's list still has it.
- [x] 3.2 The Today page, `todayCount` (and so the icon badge), the briefing and `shellPublish` use that predicate. The weekly review and Upcoming's lead do not. Verified by `web/src/lib/dayLists.test.ts` and `web/src/lib/briefing.test.ts`.
- [x] 3.3 Today's menu offers "Hide tasks assigned to others" only when the membership cache has a shared project with another member, and "Show tasks assigned to others" while it is on. On a phone the item is in the bar's overflow. Verified by `web/src/app/todayAgenda.test.tsx`.
- [x] 3.4 New strings pass the catalogues. Verified by `web/src/lib/i18n.test.ts` via `npm test` in `web/`.

## 4. Words

- [x] 4.1 `docs/today-and-upcoming.md` says the menu item exists, is off until turned on, and leaves Upcoming alone. `npm run docs:build` in `web/` refreshes the in-app help. Verified by `npm run docs:check` in `web/`.
- [x] 4.2 CHANGELOG entry under Unreleased, citing #827. The MCP and API `today` list stay the date rule; no change there.

## 5. Integration

- [x] 5.1 `go test ./...` passes.
- [x] 5.2 `npm test` and `npm run build` in `web/` pass.
