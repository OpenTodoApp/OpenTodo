## 1. Server

- [x] 1.1 Migration `0075_workspace_features.sql` and the Go step `store.migrateWorkspaceFeatures` adding the nullable `workspaces.features` column once. Verify: `go test ./internal/store -run TestMigrationWorkspaceFeatures` (the step runs twice; existing rows keep NULL).
- [x] 1.2 `internal/sync`: the known ids, `Workspace.Features` read in the existing workspaces query (`{}` for NULL), `WorkspaceInput.Features` validated against the ids and merged per key in `UpdateWorkspace` (and stored as the starting switches by `CreateWorkspace`), keeping stored unknown keys. Verify: `go test ./internal/sync -run WorkspaceFeatures`, including `TestWorkspaceFeaturesMatchWeb` (the ids equal `features.ts`).
- [x] 1.3 `PATCH /api/v1/workspaces/{id}` with `features`: merge, 400 for an unknown key or a non-boolean, 403 for a member, 401 without credentials, 403 `demo_restricted` on a demo, the map in a member's sync response. Verify: `go test ./internal/httpapi -run WorkspaceFeatures`.
- [x] 1.4 The OpenAPI description and the v1 surface regenerated with the additive `features` field only; `docs/api.md` describes it. Verify: `UPDATE_OPENAPI=1 go test ./internal/httpapi -run TestOpenAPIDescription`, `go test ./internal/httpapi -run TestV1SurfaceIsAdditive -update`, and the diff of `docs/openapi.json` and `v1_surface.json` adds and removes no schema.

## 2. Web

- [x] 2.1 `web/src/lib/features.ts`: `FEATURES`, names, `featureOn`, `useFeature`, `useFeatures`, `COMMAND_FEATURES`; `Workspace.features` cached by `storeWorkspaces`. Verify: `npx vitest run src/app/features.test.tsx` ("works offline from the cached directory").
- [x] 2.2 Destinations and commands: `moreEntriesOf` and the primary destinations, the Notes space switch, the sidebar schedule, `destinationsIn` for Appearance → Sidebar, the palette's commands (gated routes and `COMMAND_FEATURES`), the `go.*` handlers, `list.track` and `list.schedule`; `ROUTE_FEATURES` beside `ROUTE_SCREENS`. Verify: `features.test.tsx` walks `moreEntriesOf` and `commands()` with each feature off and finds nothing of it.
- [x] 2.3 The per-feature hooks and controls: `useHabitsEnabled`, `useObjectivesOn`, `useMapsOn`, the task menu's Start tracking and Start focus, the panel's Time tab, `y` and Location offer, Today's totals; How you work hides the Habits and Objectives rows and Maps its section. Verify: `npx vitest run src/app/method/howYouWork.test.tsx` ("A feature the current workspace has off").
- [x] 2.4 `FeatureOff` in the shell for a gated route, with Turn on for managers while online. Verify: `features.test.tsx` ("FeatureOff").
- [x] 2.5 Settings → Workspaces → Features (lazy), for every workspace, read-only for members, disabled offline. Verify: `npx vitest run src/app/workspacesSettings.test.tsx`, `make web`, `make bundle-budget`.
- [x] 2.6 Strings in `messages.json` and the catalogs. Verify: `node scripts/i18n-check.mjs`.
- [x] 2.7 Stories for the Features tab (owner and member) and their UI baselines from the UI baselines workflow (`stories` = `screens-workspaces--settings-features`). Verify: `make ui-lint`, the workflow's artefact committed.

## 3. Docs and release

- [x] 3.1 `docs/workspace-features.md` with its screenshot (`node scripts/docs-screenshots.mjs workspace-features`), links from `docs/workspaces.md` and `docs/settings.md`, the API page's workspace object; `make docs` and `make docs-check`. Verify: both pass.
- [x] 3.2 Changelog fragment `changelog.d/Added/workspace-feature-switches.md` and the ROADMAP row. Verify: `make repo-check`.
- [x] 3.3 `make check`. Verify: it passes.
