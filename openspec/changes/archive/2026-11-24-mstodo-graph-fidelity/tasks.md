# Tasks

## 1. Importer

- [x] 1.1 Map Graph recurrence patterns and ranges through `recurrence.FromRRULE`, drop the rule of completed tasks, accept Outlook statuses and warn on unknown ones, strip HTML heads, styles, scripts and comments, note shared lists and keep checklist creation times. Verified by `go test ./internal/importer -run MicrosoftToDo` and the golden previews in `testdata/microsoft-todo-json/` (`go test ./internal/importer -run TestNamedFormatFixtures`).

## 2. Docs

- [x] 2.1 Update the Microsoft To Do table of `docs/import.md` and the facts of `docs/switch/microsoft-todo.md` that the mapping changes. Run `make docs` and `make docs-check`.

## 3. Integration

- [x] 3.1 Run `go test ./internal/importer/...`, the import screen tests in `web/` (`npx vitest run src/app/importScreen.test.tsx src/app/import`) and `make openspec-validate`.
