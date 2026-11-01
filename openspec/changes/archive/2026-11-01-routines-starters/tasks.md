# Tasks

Prerequisites: `routines-engine`, `routines-editor` and `routines-dynamic-data` are merged. "Describe it" moved to `routines-describe-it`.

## 1. Library

- [x] 1.1 `scripts/routine-templates.mjs`: routine templates in `templates/routines/` (fields, choices declared and used, catalogue kinds, no task chosen by hand, at most 20 steps, translations keep inserted values, personal data, size, unique titles, a test filling every choice); `scripts/templates-check.mjs` skips `routines/` and runs it; fixtures for each failure; verify `node --test scripts/templates-check.test.mjs` and `make templates-check`
- [x] 1.2 Compile: `web/src/generated/routineStarters.json` (lazy, no tests) and `internal/rules/testdata/starters.json` (with tests) from `scripts/templates-build.mjs`, `--check` for both; the site bundle's `templates/routines.json` and the `routineTemplates` manifest fact; verify `make templates-check` and `node --test scripts/site-bundle.test.mjs`
- [x] 1.3 The eleven starters of design D4 in English with five translations; verify the check passes
- [x] 1.4 `internal/rules/starters_test.go`: every starter filled, run against its seeded data, writes compared exactly; verify `go test ./internal/rules/...`
- [x] 1.5 `web/src/lib/rules/starters.ts` (load, localise, search, fill, needs) and `starters.test.ts` (every starter type-checks filled, holds no task chosen by hand; fill and search); verify `npm test`
- [x] 1.6 `templates/README.md`: the routine template format with a complete example and how to propose one; verify `make docs-check`

## 2. App

- [x] 2.1 Routes `/routines/starters` and `/routines/starters/<slug>`; "Start from a starter" in the Routines page header and the empty state with the starters listed below; verify happy-dom tests ("Empty Routines page") and `npm test`
- [x] 2.2 The starters page (categories, search in the user's language and English, keyboard) and a starter's page (description, sentences, needs with availability, choices with "Create *name*", Use this starter disabled until filled, opens the editor unsaved); verify happy-dom tests (each scenario of "Routine starters in the app")
- [x] 2.3 Strings in the six catalogs; stories for the starters list and a starter's page; verify `make i18n-check`, `make ui-lint`

## 3. Checks

- [x] 3.1 Bundle: starters lazy; verify `make bundle-budget`
- [x] 3.2 `docs/routines.md` (starters), `docs/automations.md` if it names them; verify `make docs-check`
- [x] 3.3 CHANGELOG Unreleased entry and ROADMAP row (at archive); `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
