## 1. Registry and data

- [ ] 1.1 `internal/features/registry.json` (ids, groups, `needs`), embedded in Go and imported by the web; vectors for the dependency closure; the Dockerfile copies it; a row in `docs/contracts.md`. Verify: `go test ./internal/features` and `npx vitest run src/lib/features.test.ts`.
- [ ] 1.2 The `features` column (migration), `internal/sync/workspaces.go` field, the one-time upgrade map from each owner's `user_prefs` (D8), the sync response. Verify: `go test ./internal/sync -run Features`, one test per account switch and a workspace without a `user_prefs` row.
- [ ] 1.3 MODIFIED deltas for `habits`, `plan-objectives`, `time-sectors`, `task-energy`, `day-parts`, `open-loops`, `method-views`, `app-shell`, `settings-navigation`, `first-run` and `workspaces`, each copying its requirement whole. Verify: `make openspec-validate`.
- [ ] 1.4 `user_prefs.sidebar_layout` in `Schema`, regenerated (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`); its reader and the one-time computation from `sidebar_destinations`, `sidebar_order` and `method_mode` (D6). Verify: `npx vitest run src/lib/sidebarLayout.test.ts`, covering Open Loops first and a promoted Completed.

## 2. Server

- [ ] 2.1 `PATCH /api/v1/workspaces/{id}` with `features` (merge per key, dependency closure, owner or admin, unknown ids 400), `GET` with the full map, MCP `list_workspaces`; `docs/api.md`, OpenAPI, the v1 surface. Verify: `go test ./internal/httpapi -run WorkspaceFeatures`, one test per API scenario (anonymous, member, read token, demo, unknown id, two managers).

## 3. Web

- [ ] 3.1 `web/src/lib/features.ts`: `featureOn`, `useFeature`, the closure, the registry test (every place names a known feature). Verify: `npx vitest run src/lib/features.test.ts`.
- [ ] 3.2 The hook points of D7 and the off page's empty state; the six readers and the method readers move to `useFeature`. Verify: rendered tests of "Basics stay", "Notes off and on again", "A field keeps its value" and "Old link"; the existing habits, objectives, sectors, energy, day-parts and method tests updated; `npm test`.
- [ ] 3.3 The Features page (lazy, first in Settings, intention wording, read-only for members, offline) replacing How you work, its legacy addresses, the two personal choices in their features' sections, scope meta on every section, the dependency toast with Undo, "Turn on <feature>" in search and the palette. Verify: rendered tests of the Features, dependency, scope and Turn on scenarios; `make i18n-check`, `make ui-check`, `make bundle-budget`.
- [ ] 3.4 The Sidebar page as one ordered list with the More divider and "Turn on more features"; no method override in the sidebar. Verify: rendered tests of "Drag under More", "A feature turned on" and "Open Loops first"; stories and baselines.
- [ ] 3.5 The first run's one question; New workspace starting Essential. Verify: the first-run and New workspace tests.
- [ ] 3.6 Views across workspaces follow the open workspace. Verify: a palette and a reminder test across two workspaces.

## 4. Docs and checks

- [ ] 4.1 A "Features" guide (with a screenshot), the sidebar, Open Loops and first-run guides, `changelog.d/Added/workspace-features.md`, the ROADMAP row. Verify: `make docs`, `make docs-check`, `make check`, `go test ./...`, `cd web && npm test && npm run build`.
