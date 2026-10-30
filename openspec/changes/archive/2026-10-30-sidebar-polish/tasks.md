# Tasks

## 1. Schema

- [x] 1.1 Add `sidebar_counts` and `sidebar_order` (strings, default `""`) to `Schema["user_prefs"]` and `icon` (nullable string, default `null`) to `Schema["view"]` in `internal/sync/ops.go`, to `UserPrefs` and `View` in `web/src/lib/types.ts`, and to the defaults in `web/src/lib/ops.ts`; verify `go test ./internal/sync/...` and `npm test -- ops`

## 2. Counts on every row (#545)

- [x] 2.1 Read `sidebar_counts` in `web/src/lib/appearance.ts` (unknown values read as the default and are kept), and add the "Sidebar counts" choice to `AppearanceSection.tsx`; verify `npm test -- appearance`
- [x] 2.2 In `Sidebar.tsx`, `FavouritesGroup.tsx` and the label and view rows, show counts at rest when the preference is `all` (no zero, none on dashboards), and put the ⋯ button in the count's slot on hover or focus with a fine pointer; verify `npm test -- sidebar favouritesMenus` with the scenarios "Every count on", "Menu in the count's place" and "Collapsed parent totals", and the existing "Only two numbers at rest"
- [x] 2.3 Add the label and view menu buttons in the sidebar rows (the existing menus), keyboard reachable; verify `npm test -- sidebar viewMenuSites labelsView`

## 3. Destination order (#562)

- [x] 3.1 Add `orderDestinations(primary, stored)` in `web/src/lib/appearance.ts`: stored ids first, unknown ids ignored and kept, missing ones in the default order. Unit-test it in `npm test -- appearance`
- [x] 3.2 Apply it in `primaryDestinations` outside Open Loops first and in the phone drawer; verify `npm test -- sidebar phoneDrawer` with "Reordered destinations"
- [x] 3.3 Replace the promotion switches in Settings → Appearance with the ordered "Sidebar destinations" list: drag handle, Move up and Move down, Alt+↑ and Alt+↓ with an announcement, and switches on the promotable rows, disabled in Open Loops first; verify `npm test -- appearance preferencesPanels` and `make ui-check` with an updated `appearanceSettings.stories.tsx`

## 4. View icons (#560)

- [x] 4.1 Validate `icon` in `internal/httpapi/views.go` (null or `iconset.Valid`, else 400 `invalid_input` naming `icon`), and check that the export carries it; verify `go test ./internal/httpapi/... -run View` with the valid, invalid and unauthenticated cases
- [x] 4.2 Add "Icon…" to the view menu with `iconPickerSpec`, and render the icon (default icon for null or unknown names) in the Views group, Favourites, the overview, the header (when set), the palette (the Start view choice is a native select of names, see design D4); verify `npm test -- viewMenu ViewsView palette sidebar`
- [x] 4.3 Document `icon` in `docs/api.md` and the OpenAPI document, and the menu item in `docs/saved-views.md`; verify `go test ./internal/httpapi/... -run OpenAPI` and the docs link check in `make repo-check`

## 5. New view draft (#559)

- [x] 5.1 Save and restore the draft in `FilterView.tsx` through the local meta table under `filterDraft:<workspace id>` (300 ms debounce, cleared on save and on sign-out, `?q=` replaces the query and pushes the old one to the history); verify `npm test -- filterView` with the scenarios of "New view keeps its draft"
- [x] 5.2 Add "Clear" with Undo to the filter panel's header; verify `npm test -- filterView` and that the export test shows no draft (`npm test -- export`)

## 6. Words and docs

- [x] 6.1 Add the new strings to `web/src/locales/messages.json` and translate them in de, es, fr, it and pt; verify `npm test -- i18n` and `make ui-lint`
- [x] 6.2 Update `docs/settings-app.md` (Sidebar counts, destination order), `docs/views.md` / `docs/saved-views.md` (icons, draft) and `docs/projects.md` (counts); verify `make repo-check`

## 7. Integration

- [x] 7.1 Run `npm test` and `npm run build` in `web/`, `go test ./...` and `make check`. In the built app, check at 1280 px and 390 px: every count on with hover swapping to ⋯, a reordered sidebar on both widths, a view icon in every place, and a draft that survives a reload
