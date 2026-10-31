# Tasks

Prerequisites: `routines-engine` and `routines-editor` are merged.

## 1. Library

- [ ] 1.1 `scripts/templates-check.mjs`: routine templates in `templates/routines/` (fields, placeholders declared and used, catalogue kinds, at most 20 steps, the shared type checker with typed samples, personal data, size, unique titles); fixtures for each failure; verify `node --test scripts/templates-check.test.mjs` and `make templates-check` (or the CI step that runs it)
- [ ] 1.2 `scripts/templates-build.mjs`: routine templates in the web bundle (lazy, with the chooser) and in the site bundle with the `routineTemplates` manifest fact; verify `npm run build` and the site bundle test
- [ ] 1.3 The eight starters of design D3 in English with five translations; verify the check passes
- [ ] 1.4 `internal/rules`: a test that plans every starter with placeholders filled against a fixture account through the dry run, every step `ok` or `ended` by design; verify `go test ./internal/rules/...`
- [ ] 1.5 `templates/README.md`: the routine template format with a complete example and how to propose one; verify `make docs-check`

## 2. App

- [ ] 2.1 The New routine chooser (Start empty, From a starter, Describe it with its visibility rule and the search hint); verify happy-dom tests ("No provider", "Not consented yet") and `npm test`
- [ ] 2.2 Starter list and detail (categories, search in the user's language and English, needs with availability, offline); Use this starter opens the editor with placeholders, "Create *name*" first in pickers, Save blocked until filled; verify happy-dom tests (each scenario of "Routine starters in the app")
- [ ] 2.3 Keyboard: the library's rules in the starter list; verify a happy-dom test

## 3. Describe it

- [ ] 3.1 `internal/assistant`: the `draft_routine` tool built from the available catalogue, the fixed instructions, context names marked untrusted, no other tool, type check and one retry, usage tagged `routine_draft`; verify `go test ./internal/assistant/...` with a stub provider (a draft that checks, a draft fixed on retry, one that fails twice)
- [ ] 3.2 `POST /api/v1/assistant/routine-draft` through `routes.handle` with the session policy and `.DemoDenied()`; limits (500 characters, one turn, allowance, 10 per hour); verify `go test ./internal/httpapi/...` (401, 403 `session_required`, 403 `consent_required`, 413, 409, 429 twice, 403 `demo_restricted`; `policy_test.go`; the demo deny list test)
- [ ] 3.3 Web: the Describe it sheet, the draft in the editor with the banner and errors on cards; never saves or runs; verify happy-dom tests ("A sentence becomes a draft", "Nothing is saved")
- [ ] 3.4 Encrypted accounts: the same draft through the on-device assistant and the TypeScript checker, no request to the OpenTodo server; verify `npm test` (a request-count assertion)
- [ ] 3.5 Strings in the six catalogs; verify `make i18n-check`

## 4. Checks

- [ ] 4.1 Bundle: starters and sheet lazy; verify `make bundle-budget`
- [ ] 4.2 `docs/automations.md` (starters, Describe it), `docs/assistant.md`; verify `make docs-check`
- [ ] 4.3 CHANGELOG Unreleased entry (at archive); `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
