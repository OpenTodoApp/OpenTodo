## 1. Registry and data

- [ ] 1.1 `internal/features/registry.json` (ids, groups, `needs`), embedded in Go and imported by the web; vectors for the dependency closure; the Dockerfile copies it; a row in `docs/contracts.md`. Verify: `go test ./internal/features` and `npx vitest run src/lib/features.test.ts`.
- [ ] 1.2 The `features` column (migration), `internal/sync/workspaces.go` field and preset resolution, the one-time upgrade map from each owner's `user_prefs` (D4), the sync response. Verify: `go test ./internal/sync -run Features`, a test per row of the D4 table, and a workspace without a `user_prefs` row reading as Full.
- [ ] 1.3 MODIFIED deltas for `habits`, `plan-objectives`, `time-sectors`, `task-energy`, `day-parts`, `open-loops`, `first-run`, `settings-navigation` and `workspaces`, each copying its requirement whole. Verify: `make openspec-validate`.

## 2. Server

- [ ] 2.1 `PATCH /api/v1/workspaces/{id}` with `features` (merge per key, the dependency closure, owner or admin, unknown ids 400), `GET` returning the resolved map, MCP `list_workspaces`; `docs/api.md`, OpenAPI, the v1 surface. Verify: `go test ./internal/httpapi -run WorkspaceFeatures`, one test per API scenario (anonymous, member, read token, demo, unknown id, two managers).

## 3. Web

- [ ] 3.1 `web/src/lib/features.ts`: `featureOn`, `useFeature`, presets, the closure; the registry test failing on an unknown id. Verify: `npx vitest run src/lib/features.test.ts`.
- [ ] 3.2 The hook points of D6 (sidebar and More, PROMOTABLE and the tab bar, palette routes, the shortcut dispatcher, quick-add phrases, settings sections, route screens, row and panel controls), and the off page's empty state. Verify: rendered tests of "Notes off", "A field keeps its value", "Old link" and "Basics stay".
- [ ] 3.3 The six switches: readers move to the workspace feature; How you work keeps the two personal choices while their feature is on. Verify: the existing habits, objectives, sectors, energy, day-parts and method tests updated, and `npm test`.
- [ ] 3.4 The Features page (lazy, first in Settings, read-only for members, offline), scope meta on every section, the dependency toast with Undo, "Turn on <feature>" in search and the palette for managers. Verify: rendered tests of the Features page, dependency and Turn on scenarios; `make i18n-check`, `make ui-check`, `make bundle-budget`.
- [ ] 3.5 "Who is it for?" in the first run's step 2 and in New workspace. Verify: the first-run and New workspace tests; stories and baselines.
- [ ] 3.6 Views across workspaces follow the open workspace. Verify: a palette and a reminder test across two workspaces.

## 4. Docs and checks

- [ ] 4.1 A "Features" guide (with a screenshot), the How you work and first-run docs, `changelog.d/Added/workspace-features.md`, the ROADMAP row. Verify: `make docs`, `make docs-check`, `make check`, `go test ./...`, `cd web && npm test && npm run build`.
