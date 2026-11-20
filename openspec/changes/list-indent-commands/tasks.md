# Tasks

## 1. Web app

- [x] 1.1 `indent` and `outdent` in `editorCommands()` (`web/src/app/editorCommands.ts`), on `sinkListItem` and `liftListItem`, available only where they can act; "Indent" and "Outdent" in every locale. Verify: `npx vitest run src/app/editorListIndent.test.ts` (Indent nests "paint" under "fence", Outdent brings it back and then out of the list; neither on a paragraph, no Indent on a first line), `npx vitest run src/app/editor src/app/task-detail src/app/notes src/lib/richtext`, `node scripts/i18n/extract.mjs --write`, `node scripts/i18n-check.mjs`, `npx tsc -b --noEmit`, `npx eslint` on the changed files.

## 2. Checks

- [x] 2.1 Built app, Chromium at 390 × 844 with touch: in a task's notes, the caret in a list's second line, More shows Indent and Outdent; Indent nests the line, Outdent brings it back, and the stored notes read `- fence` and `- paint` again.
- [ ] 2.2 On a phone: the same.

## 3. Docs and release

- [x] 3.1 `docs/formatting-row.md`. Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Changed/list-indent-commands.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
