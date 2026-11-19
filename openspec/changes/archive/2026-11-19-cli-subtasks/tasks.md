# Tasks

## 1. Create and move

- [x] 1.1 `ot add --parent <ref>`: resolve the ref, refuse a completed parent or a contradicting `--project` locally, and take the parent's project or workspace. Verify with `TestSubtaskAdd` in `internal/cli` (`go test ./internal/cli/...`).
- [x] 1.2 `ot edit --parent <ref>|none`: send `parent_id`, plus the parent's `project_id` when it differs, and print the server's refusal for a cycle. Verify with `TestSubtaskEdit`.

## 2. Cascades

- [x] 2.1 Descendants from one task list, at every depth, skipping deleted tasks and safe against a cycle. Verify with `TestDescendants`.
- [x] 2.2 `--subtasks` on `done`, `rm` and `edit` (project change), one request per task in the order of design D3, listed by `--dry-run`, confirmation listing every task for `rm`. Verify with `TestSubtaskCascades`, including the default without the flag.

## 3. Output

- [x] 3.1 Nested table for `ot list --project` and `--inbox` with the parent's progress; flat elsewhere; `--json` order unchanged. Verify with `TestSubtaskListNesting`.
- [x] 3.2 `ot list --parent <ref>`. Verify with `TestSubtaskListParent`.
- [x] 3.3 `ot task show`: parent path, subtasks and progress, and `subtasks` in `--json`. Verify with `TestSubtaskShow`.
- [x] 3.4 `--parent` and `--subtasks` in the command table (`ot schema`, `testdata/schema.golden.json`, the v1 surface), and task completion after `--parent`. Verify with `TestSchemaCoversEveryCommandAndFlag`, the surface test in `internal/httpapi` and `completion_test.go`.

## 4. Docs

- [x] 4.1 `docs/cli.md` and `docs/notes-and-subtasks.md` describe the flags, the agent skill mentions `--parent`, and there is a changelog fragment `changelog.d/Added/cli-subtasks.md`. Verify with `make docs-check` and `make repo-check`.
- [x] 4.2 `make check` passes.
