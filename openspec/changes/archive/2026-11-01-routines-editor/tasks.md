# Tasks

Prerequisite: `routines-engine` is merged.

## 1. Data and server

- [x] 1.1 `internal/sync/ops.go`: `user_prefs.routines_seen_at` (number) and `user_prefs.routines_hide_successes` (string), documented; regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync/...` (LWW keeps the later mark)
- [x] 1.2 `GET /api/v1/me/rules/runs?since=&for=inbox`: the card's rules (own manual and test runs left out, failures and proposals kept until handled, successes after the marker, hidden with the setting), dismissals (`rule_runs.dismissed_at`); verify `go test ./internal/httpapi/... ./internal/rules/...` (each scenario of `routine-inbox` "What the card shows"; 401 without credentials; 404 for another user's run on dismiss)
- [x] 1.3 `internal/notify`: kinds `routine_failed` (one per routine per day, count updated) and `routine_proposal`; never for tests or own manual runs; channels' `routine` event carries them; verify `go test ./internal/notify/... ./internal/channels/...`
- [x] 1.4 Retention keeps failed runs until seen (30 days after the marker passed, at most 90) and proposal runs until handled; verify `go test ./internal/rules/...` with a stepped clock

## 2. Editor

- [x] 2.1 `web/src/app/routines/`: the Routines page at `/routines` with `/rules` redirecting, rows with steps summary, Run now, "n steps not available", the Runs tab; `RulesView.tsx` retired; verify happy-dom tests and `npm test`
- [x] 2.2 Sentence cards: templates per step kind in six languages with named slots, word buttons, output line, blocks indented, card menu; an old rule opens as When + Change tasks and saving unchanged writes nothing; verify happy-dom tests ("Reading a routine", "An old rule", "Saved offline")
- [x] 2.3 Pickers and chips (D3) with the Combobox and `web/src/ui` fields; chips of accepted types first, "Needs conversion" after; verify happy-dom tests
- [x] 2.4 Live preview (D4): device planner for data and Change tasks steps, draft route for the rest with debounce, placeholders offline, limit warnings; a test that a preview writes nothing and logs nothing; verify `npm test`
- [x] 2.5 Type errors and fixes (D5) from the shared checker; Save blocked on a type error; verify `npm test` (each fix of the table)
- [x] 2.6 Add step (D6): search over names, descriptions and synonyms in the user's language and English, suggestions by output type, unavailable steps only in search with hint and link; verify happy-dom tests ("Suggestions after lines", "Search for an unavailable step", "Synonym in Italian")
- [x] 2.7 Unavailable steps (D7) from the cached catalogue; verify a happy-dom test
- [x] 2.8 Test, Save, Run now (D8); verify happy-dom tests with a mocked API
- [x] 2.9 History tab, all-runs page and run detail with titles from local data, "Deleted task", errors with fixes and settings links, Undo run with its answer, offline age; verify happy-dom tests

## 3. Inbox card

- [x] 3.1 The card inside the Inbox list (lazy, only for users with routines), grouping, five lines and See all runs, Dismiss, Mark as seen, 2-second seen rule, the per-device baseline; verify happy-dom tests (each `routine-inbox` scenario) and `npm test`
- [x] 3.2 Settings → Notifications: Hide successful runs; verify a happy-dom test

## 4. Quality

- [x] 4.1 Shortcuts `routines.move-up`, `routines.move-down`, `routines.save`, `routines.test`, `routines.add-step` in `web/src/lib/shortcuts.ts`, editor-scoped; the registry conflict test and the cheat sheet; verify `npm test`
- [x] 4.2 Accessibility: card groups, word button names, polite announcements, 44 px targets, no sideways scroll at 360 px; verify `make e2e` (frame and axe steps) and happy-dom tests
- [x] 4.3 Strings in the six catalogs; verify `make i18n-check`
- [x] 4.4 Stories for the card, word button, chip, Add step sheet, run detail and Inbox card; verify `make ui-lint` and `make ui-check`
- [x] 4.5 Bundle: the editor chunk lazy, measure first load; raise `web/bundle-budget.json` only with the reason; verify `make bundle-budget`
- [x] 4.6 `docs/automations.md` (the editor, history, the Inbox card), user guide screenshots; verify `make docs-check`
- [x] 4.7 CHANGELOG Unreleased entry (at archive); `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
