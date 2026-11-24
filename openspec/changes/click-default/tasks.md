# Tasks

## 1. Server

- [x] 1.1 `user_prefs.row_click` in the op schema (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`)
- [x] 1.2 `PUT /api/v1/settings/row-click` (owner, demo denied, `settings.changed`) and `rowClick` in `auth/status`; an admin, a member and an anonymous caller are refused, an unknown value is 400 (`go test ./internal/httpapi -run 'TestRowClickDefault|TestSecurityRoutePolicies'`)
- [x] 1.3 `docs/api.md`, the v1 surface (`go test ./internal/httpapi -run TestV1SurfaceIsAdditive -update`) and the OpenAPI description (`UPDATE_OPENAPI=1 go test ./internal/httpapi -run TestOpenAPIDescription`)

## 2. Web

- [x] 2.1 `lib/rowClickPref.ts`: the account's choice, the server's default from `auth/status` mirrored on the device, the account's choice winning, one synced op (vitest `src/lib/rowClickPref.test.ts`)
- [x] 2.2 `useRowClicks` records no press under Open details: a click opens the page or the side panel and never edits; the account's choice wins over the server's (vitest `src/app/task-list/clickSelects.test.tsx`)
- [x] 2.3 Settings → Appearance → Task details "Click a task to" and Settings → Server → Task lists (vitest `src/app/rowClickSettings.test.tsx`, `src/app/settingsSections.test.tsx`); every catalogue (`make i18n-check`)

## 3. Docs and checks

- [x] 3.1 `docs/settings-app.md`, `docs/settings-you.md`, `docs/settings-server.md`, `docs/task-panel.md`; `changelog.d/Added/click-default.md`; `make docs` and `make docs-check`
- [ ] 3.2 `npm test`, `npm run typecheck` and `npm run build` in web/, `make bundle-budget`, `make openspec-validate`, `go test ./...`
