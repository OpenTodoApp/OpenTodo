# Tasks

## 1. Structure

- [x] 1.1 Add `ENTRIES`, `entryOf()`, `indexTree()` and `navOrder()` to `web/scripts/docs/lib.mjs` with tests in `lib.test.mjs` (mapping, overrides, README nesting); verify `cd web && npx vitest run scripts/docs`.
- [x] 1.2 Generate the six section pages and the new landing in `site.mjs`/`build.mjs`; verify `make docs` writes `dist/docs-site/{start,use,self-host,integrate,reference,internals}/index.html` and every page appears on exactly one section page.

## 2. Look

- [x] 2.1 Website header and footer, sidebar by entry point, breadcrumb, pager in sidebar order (`site.mjs`); verify the no-JS checks of `make docs-site-check`.
- [x] 2.2 Rewrite `docs.css` on the app tokens with Inter and no Google Fonts; verify `make docs-site-check` (axe, 360 px, light and dark) and that a built page has no `fonts.googleapis.com`.

## 3. Checks

- [x] 3.1 `make docs-check`, `make docs-site-check`, `make openspec-validate`, `make repo-check`; before and after screenshots at 390 and 1280 px, light and dark.
