# Tasks

## 1. The link grammar, shared

- [ ] 1.1 Add `web/src/lib/noteLinks.ts` `linksIn(markdown)` (internal `?note=`, `?task=`, `?project=` links, code spans and fences skipped, the `indexOf` gate) and the shared vectors `internal/notelinks/testdata/links.vectors.json`; verify with `npm test -- noteLinks` in web/
- [ ] 1.2 Add `internal/notelinks` (standard library) reading the same vectors, list the contract in `docs/contracts.md`; verify with `go test ./internal/notelinks` and the contracts repo check (`make repo-check`)

## 2. Links in the editor

- [ ] 2.1 Map runs with an internal link mark to an editor-only `ref` atom node and back in `richtextEditor.ts`, with a 1.0 compatibility test that decodes a document written by this build with the v1.0.0 display model (`richtext.test.ts`: the text and the `link` mark survive, the projection reads `[Title](?note=<id>)`); verify with `npm test` in web/
- [ ] 2.2 Node view with the live title, the muted unreachable state and atomic caret behaviour, label refresh on user edits only (test: opening writes no op; an edit after a rename rewrites the label; a doubled label displays one link); verify with `npm test` in web/
- [ ] 2.3 The `[[` trigger in `editorSuggest.ts`, the picker (ranking, 8 rows, New note row in one batch with one Undo, shared-project scope, no picker for viewers) and **Link to…** in the `/` menu of notes only; interaction tests in happy-dom with `waitFor`; verify with `npm test` and `npm run build` in web/
- [ ] 2.4 Render internal links with current titles in `markdown.ts`/`Markdown.tsx` and note previews, opening in place; verify with `npm test` in web/
- [ ] 2.5 Open `?note=<id>` and `?project=<id>` in `Shell.tsx` and drop the parameter (test beside the `?task=` one); verify with `npm test` in web/

## 3. Linked references

- [ ] 3.1 The index in `noteLinks.ts`: sliced build, incremental update from `taskDelta` and from project and note clocks, full rebuild fallback, drop on lock; a randomized test checks the incremental index against a full rebuild; verify with `npm test` in web/
- [ ] 3.2 The Linked references section on the note panel and page, below a task's notes, and the folded line in a project's note area (per-device expanded state), with stories and visual baselines (`make ui-check`) and strings in every catalogue (`make i18n-check`); verify with `npm test` and `npm run build` in web/
- [ ] 3.3 Perfseed notes fixture gains links (`internal/perfseed/notes.go`), the `note-references` metric in `scripts/perf/budgets.json`, `scripts/perf/run.mjs` and `docs/performance.md`; verify with `go test ./internal/perfseed` and `node --test scripts/perf/budgets.test.mjs`

## 4. Scripts and assistants

- [ ] 4.1 `links` and `linked_from` in `get_note` and `get_task` for plaintext accounts, absent on encrypted ones, and the link form in the write tools' descriptions (`internal/agenttools`); verify with `go test ./internal/agenttools ./internal/mcp`
- [ ] 4.2 `ot notes links <ref>` with table and `--json` output, `ot schema` entry, local computation, `encryption_enabled` exit 5 when locked; verify with `go test ./internal/cli`

## 5. Docs and integration

- [ ] 5.1 Document `[[`, Link to…, Linked references and the Markdown form in `docs/formatting.md`, `docs/notes.md` and `docs/notes-to-tasks.md`, add `changelog.d/Added/note-links.md`; verify with `make docs` and `make docs-check`
- [ ] 5.2 Run `make check` and verify it passes
