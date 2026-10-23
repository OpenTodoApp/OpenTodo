## 1. Data and server

- [x] 1.1 Three additive view fields (D2): `layout`, `show_completed`, `hidden_props` in `internal/sync/ops.go`, `web/src/lib/types.ts`, the row defaults in `web/src/lib/ops.ts` and `internal/sync/testdata/schema_fixture.json`; verify `go test ./internal/sync` and `schemaFixture.test.ts`
- [x] 1.2 REST validation (D2): `layout` in the enumerations, `hidden_props` names checked, no defaults on create, in `internal/httpapi/views.go`; verify `TestViewDisplayOptions` and the rejected-patch cases in `views_test.go`
- [x] 1.3 `displayOptions`, completed matches in `runView` and `compileView`, display fields in `createView` and `updateView` (D2, D4); verify `views.test.ts` "display options"

## 2. Screens

- [x] 2.1 Words and addresses (D1): Views, Saved views, New view, the breadcrumb; `/views/new` and `/views/<id>` with `/filter` and `/view/<id>` replaced in place; the five catalogs; verify `viewsAndDisplay.test.tsx` "addresses", `sidebar.test.tsx`, `naming.test.tsx` and `make i18n-check`
- [x] 2.2 Hidden row properties on `TaskRow` (D3); verify `viewsAndDisplay.test.tsx` (the estimate leaves the row)
- [x] 2.3 The toolbar, the chips and the filter panel with the restyled builder (D5); verify `viewsAndDisplay.test.tsx` "toolbar chips" and "Filter opens the filter panel", `filterScreens.test.tsx`
- [x] 2.4 The display panel and the board layout (D2); verify `viewsAndDisplay.test.tsx` "the display panel writes layout, properties and completed tasks"
- [x] 2.5 Save as view in place, the New view page grouped like a saved view (D6); verify `viewsAndDisplay.test.tsx` "the New view page"
- [x] 2.6 Stories `Screens/Saved view` (list, board, hidden properties, filter panel, display options, save card); verify `make ui-lint`

## 3. Docs, checks and baselines

- [x] 3.1 `docs/saved-views.md`, `docs/filters.md`, `docs/api.md`, `docs/sync.md`, `docs/interface-guide.md` and the wording in the other guides; CHANGELOG under Unreleased → Changed; ROADMAP; verify `make docs-check`
- [x] 3.2 `scripts/e2e-views.mjs`, the layout screens and the screenshot scripts follow the new words and addresses
- [x] 3.3 Render a view, its display panel, the board and New view with the save card from the real app at 1440×900 in dark and compare with the round-2 mock-ups
- [x] 3.4 Regenerate the visual baselines in the pinned Playwright image; verify `make ui-check` in CI
- [x] 3.5 Run `npm test`, `npm run build` and `go test ./...`, open the pull request and get CI green
