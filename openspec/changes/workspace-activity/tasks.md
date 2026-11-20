## 1. Events

- [ ] 1.1 `time_tracked` and `time_changed` in `internal/activity` and `web/src/lib/activity.ts`, the `time` category in both feed tables, the shared fixture (D3). Verify: `go test ./internal/activity` and `cd web && npx vitest run src/lib/activity.test.ts src/lib/feed.test.ts`.
- [ ] 1.2 Several kinds in `GET /api/v1/activity` and Updates (D4). Verify: the scenarios of "Several kinds and time tracking in the feed".

## 2. Route

- [ ] 2.1 `GET /api/v1/workspaces/{id}/activity` with its policy, filters, 400 and 404 (D2); `docs/api.md`, the OpenAPI file, the v1 surface. Verify: `go test ./internal/httpapi -run WorkspaceActivity` with one test per scenario of "Workspace activity route", and a large-history page test.

## 3. Page

- [ ] 3.1 The workspace menu item, `/workspaces/<id>/activity`, the reused activity layout with the date range and multi-kind filter, remembered per workspace on the device, offline from local events (D1, D5, D6); strings in every locale; stories and baselines. Verify: the scenarios of "Workspace activity", `make i18n-check`, `make ui-check`, `make bundle-budget`.

## 4. Docs and checks

- [ ] 4.1 The activity guide in `docs/`, `changelog.d/Added/workspace-activity.md`, the row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make openspec-validate`, `go test ./...`, `cd web && npm test`.
