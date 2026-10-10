# Tasks

## 1. Schema (server and client)

- [x] 1.1 Add `view` entity (`name`, `query`, `kind`, `group_by`, `sort_by`, `sort_dir`, `pinned`, `position`, `color`, `panels`, `created_at`, `deleted_at`) to `internal/sync/ops.go` `Schema` and `Plural`; verify `TestValidateAcceptsViewOps` (`go test ./...`)
- [x] 1.2 Mirror in `web/src/lib/types.ts` (`View`, `VIEW_FIELDS`), defaults in `ops.ts`, `views` table in `db.ts` (database version bump); verify `ops.test.ts` applies view ops and maps unknown option values to defaults at read time (`npm test`)
- [x] 1.3 Update `docs/sync.md` schema table; verify it lists every field in `Schema`

## 2. Server API

- [x] 2.1 Go filter parser (`internal/filter`) accepting the grammar from `docs/filters.md`; verify `TestFilterParserAcceptsDocsExamples` and rejection cases (`go test ./...`)
- [ ] 2.2 `views` collection handlers with validation (name, query parses, enumerations, panel ids exist and are list views, immutable kind); verify `TestViewsCrud`, `TestViewsRejectInvalidOption`, `TestViewsRequireAuth` (`go test ./...`)
- [ ] 2.3 Export includes `views`; verify `TestExportIncludesViews` (`go test ./...`)
- [ ] 2.4 Document in `docs/api.md`; verify examples match handlers

## 3. Client data layer

- [ ] 3.1 `createView`, `updateView`, `deleteView`, `reorderView`, `setPinned`, `setPanels` (refuses dashboards as panels); verify `views.test.ts` CRUD and "dashboard cannot nest dashboard" (`npm test`)
- [ ] 3.2 View runner: compile query via `filter-queries`, apply grouping (project, due, priority, label, none) and sort (due, priority, position, created, title; asc/desc; undated last); verify `views.test.ts` grouping headings order and sort cases (`npm test`)
- [ ] 3.3 Pinned-view counts and dashboard panel results in one pass; verify `views.test.ts` counts match runner results (`npm test`)
- [ ] 3.4 Start view preference in `meta` with fallback to Inbox when missing; verify `views.test.ts` fallback case (`npm test`)

## 4. UI

- [ ] 4.1 "Save view" in `FilterView.tsx` (button and `s` in results), name prompt, creates pinned view; verify browser flow matching "Save the current query"
- [ ] 4.2 `SavedViewView.tsx`: editable query input, options in the header reachable by keyboard, results via the runner, parse error display; verify browser flow matching "Edit a saved query" and "Group by due date"
- [ ] 4.3 Sidebar "Views" group with counts, reorder, unpin, rename, delete; `g v` overview listing all views; verify browser flow matching "Count and order" and "Unpin"
- [ ] 4.4 `DashboardView.tsx`: responsive grid, up to six panels, add/remove/reorder, Tab/Shift+Tab between panels, placeholder for removed views; verify browser flow matching "Morning review dashboard" and "Panel view deleted"
- [ ] 4.5 Start view setting in Settings and in each view's menu; applied on launch; notice on fallback; verify browser flow matching "Open on a saved view" on two devices
- [ ] 4.6 Update `?` help; `npm run build` passes with bundle growth under 8 KB gzipped; verify by comparing `dist` sizes

## 5. Integration and docs

- [ ] 5.1 Two-device browser run: save and pin a view on A offline, change its grouping on B offline, reconnect; verify both devices show the view with the newer options and identical counts
- [ ] 5.2 Add a "Saving views" section to `docs/filters.md`, README feature list, CHANGELOG under Unreleased; verify `make check` passes
