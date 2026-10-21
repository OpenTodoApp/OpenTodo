# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/` unless another command is named.

## 1. Parser and helpers

- [x] 1.1 Teach `attributes.ts` the `#Parent/Child` path form and fold label names in `findLabel`, and return unmatched `#tokens` as `unmatched-project` chips with a reason; verify with `nlp.test.ts` (path form resolves, `#hom` with Home and Homework yields an ambiguous chip with count 2, every existing vector in `quickadd.vectors.json` parses unchanged via `vectors.test.ts`).
- [x] 1.2 Add `suggest.ts` (`tokenAtCaret`, `projectSuggestions`, `labelSuggestions`, the inserted token form); verify with `suggest.test.ts` (any-word match, accents, nested paths, no list inside quotes, duplicate names insert the path form).
- [x] 1.3 Add `edit.ts` (`parseEdit(base, draft)`, `applyParsed(task, result)`); verify with `edit.test.ts` (only the inserted span parses, "Review may report" + " draft" yields no chip, labels union, project overwrite, reminders added in the same batch).

## 2. Quick add

- [x] 2.1 Add the suggestion list to `QuickAdd.tsx` (listbox semantics, Enter or Tab picks, Esc keeps the text, Create entries, create project offline through `createProject`) and the unmatched chip; verify with `quickAdd.test.tsx` (pick "Home renovation" from `#ren`, Esc keeps `#ho` and does not close quick add, unknown and ambiguous chips, "New label" chip) and the `Capture/Quick add` story baselines via `make ui-check` (axe clean).

## 3. Title editors

- [ ] 3.1 Add `TitleField.tsx` (input, chips while editing, suggestions, commit and cancel, the remote-change rule) and use it in the panel header; verify with `titleField.test.tsx` (append ` tomorrow p1` then Enter sets due and priority and cleans the title, one Undo restores all, viewers do not parse, parsing off saves the text) and `titleDraft.test.tsx` passing unchanged.
- [ ] 3.2 Hand `TitleField` to the inline editor of `inline-task-editing` (or, if that change lands later, leave the hook in place and note it there); verify with the inline editor's tests when both exist.

## 4. Docs and integration

- [ ] 4.1 Update `docs/quick-add.md` (suggestions, path form, unmatched chip, editing a title), `docs/task-panel.md`, the Help page "Quick add" and the cheat sheet's quick add syntax rows; verify with `npm run docs:check`.
- [ ] 4.2 Run `make check`; verify it passes, and record the entry chunk size difference here.
- [ ] 4.3 Run `make openspec-validate`; verify it passes.
