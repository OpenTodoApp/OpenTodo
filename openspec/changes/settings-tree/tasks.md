## 1. The pane

- [x] 1.1 In the compact settings list (`web/src/app/SettingsView.tsx`), under the open section, list `visiblePages` as indented 30 px links to the existing sub-page routes. The section row still opens the overview. No children when `compact` is false, when the section has no pages, or when the viewer sees a single page. Truncate with CSS and keep the full name as the accessible name and `title`. Verify `cd web && npm test -- settingsView` (wide pane lists Webhooks under Integrations and marks it current on `/settings/integrations/webhooks`; phone list has no nested rows; Workspaces and an admin's People have none; activating API tokens from Webhooks lands on `/settings/integrations/tokens`).

## 2. Check

- [ ] 2.1 `cd web && npm test && npm run build`, then `make check`.
