# Tasks

## 1. Matching

- [x] 1.1 Normalised plain text per source in the link index (Markdown, code and link text removed, case and accents folded), rebuilt only for changed sources, with unit tests for code blocks, link text and accents; verify with `npm test -- noteLinks` in web/
- [x] 1.2 Whole-word title matcher (`Intl.Segmenter` with fallback), the 3-character and "Untitled note" rules, the own-note and already-linked exclusions, with unit tests for every scenario of "Unlinked mentions"; verify with `npm test -- noteLinks` in web/

## 2. The section and Link

- [x] 2.1 `UnlinkedMentions.tsx` under Linked references in standalone notes, the task panel and the project note area: folded line with count, hidden at 0, 50 rows then Show more, per-device expanded state; interaction tests in happy-dom for "A plain mention" and "Already linked"; verify with `npm test` in web/
- [x] 2.2 Link: replace the mention with a link node through the editor transaction, re-match on a moved mention, one Undo, no button for viewers; tests for "Link one mention", "Viewer" and a concurrent-edit merge test; verify with `npm test` in web/
- [x] 2.3 Stories in light and dark; verify with `make ui-check`

## 3. Budgets, docs and checks

- [x] 3.1 Idle scheduling after Linked references paint; extend the `note-references` perf scenario with a 40-mention item; verify with `make perf` (nightly metric within `scripts/perf/budgets.json`)
- [x] 3.2 Strings in every catalog (`node ../scripts/i18n/extract.mjs --write`, `make i18n-check`); `docs/note-links.md`; `changelog.d/Added/unlinked-mentions.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [x] 3.3 Run `npm test`, `npm run build` in web/, `make bundle-budget`, `make openspec-validate` and `make check`
