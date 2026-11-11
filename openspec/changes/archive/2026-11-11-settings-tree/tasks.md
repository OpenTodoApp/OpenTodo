## 1. The pane

- [x] 1.1 In the compact settings list (`web/src/app/SettingsView.tsx`), under the open section, list `visiblePages` as indented 30 px links to the existing sub-page routes. The section row still opens the overview. No children when `compact` is false, when the section has no pages, or when the viewer sees a single page. Truncate with CSS and keep the full name as the accessible name and `title`. Verify `cd web && npm test -- settingsView` (wide pane lists Webhooks under Integrations and marks it current on `/settings/integrations/webhooks`; phone list has no nested rows; Workspaces and an admin's People have none; activating API tokens from Webhooks lands on `/settings/integrations/tokens`).

## 2. Check

- [x] 2.1 `cd web && npm test && npm run build`, then `make check`. Passed on 2026-11-11 with TZ=UTC: `make web`, `go test ./...`, web `npm test` (767 files, 8,939 tests) and `npm run build`; `make check` passed except that its `npm run test:perf` step ran out of the default Node heap on the local machine, so it was rerun with `NODE_OPTIONS=--max-old-space-size=6144` (8 files, 22 tests passed) and the steps after it (`test-extension` to `repo-check`) were run on their own and passed.
