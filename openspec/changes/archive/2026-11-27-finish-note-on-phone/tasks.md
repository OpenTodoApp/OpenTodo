# Tasks

## 1. Finish the current note
- [x] 1.1 Update Shell and AddButton to show the Done arrow for an open standalone note and return to Notes on activation; extend existing tab-bar tests to verify one note remains, new notes focus the title, the plus returns, and task capture, daily notes and desktop behavior remain unchanged.
- [x] 1.2 Extend existing note interaction tests to verify immediate completion retains pending title and body/source edits, reopening shows them offline, and read-only notes stay read-only; run the affected Vitest suites.
- [x] 1.3 Update docs/notes.md and add changelog.d/Fixed/finish-note-on-phone.md; run make docs, make docs-check and make openspec-validate.

## 2. Review readiness
- [x] 2.1 Run npm test and npm run build in web/, make check and make bundle-budget; capture before/after phone screenshots and verify the keyboard-visible flow on port 8081 using the separate preview data directory.
- [x] 2.2 Review the small diff, archive the completed spec change in the finishing PR, and rerun make docs and the spec/docs checks; credit authors including Codex in the commit trailer. Create no issue or PR until requested.
