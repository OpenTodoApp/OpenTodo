## 1. List

- [ ] 1.1 The Notes list without a `kind:` chip keeps standalone and project notes; any `kind:` chip replaces that default; the count, Show more, Graph and bulk actions follow. Verify: the scenarios of "Notes page" in `web/src/app/notes` tests.

## 2. Docs and checks

- [ ] 2.1 The Notes guide in `docs/`, `changelog.d/Changed/notes-page-own-notes.md`, the row in `ROADMAP.md`, baselines if a Notes story lists task notes. Verify: `make docs`, `make docs-check`, `make openspec-validate`, `cd web && npm test`.
