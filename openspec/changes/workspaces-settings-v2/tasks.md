## 1. Layout

- [x] 1.1 Split `WorkspacesSettings.tsx` into the page and list, `WorkspaceGeneral.tsx`, `WorkspaceMembers.tsx`, `WorkspaceGroups.tsx` and `WorkspaceInvites.tsx` (D6); verify `npm run lint` passes the 250-line limit
- [x] 1.2 Two panes from 768 px with the current marker and `aria-current` (D1), drill-down with Back below 768 px; verify with a happy-dom test at 1280 and 360 px
- [x] 1.3 The wider Workspaces section column from 1024 px (D2); verify the section page test and the settings story

## 2. Header and tabs

- [x] 2.1 Header with mark, name and "n members · role"; tabs General, Members, Groups, Invites (managers), General only for the default workspace (D3); verify with tests for owner, member and default
- [x] 2.2 General: name, colour, icon, then the danger zone (Transfer and Delete or Leave); verify the existing owner/member test still passes

## 3. Members, groups, invites

- [x] 3.1 Members tab with avatars, role select and Remove for managers, badges otherwise; verify with a test
- [x] 3.2 Groups tab: rows with avatars and count; the editor with rename, Combobox member picker, members with Remove, Delete with a confirmation naming the projects shared through the group (D4); verify with tests for rename, add, remove and the confirmation's project names
- [x] 3.3 Invites tab: role (Admin for the owner only) and expiry (1 h, 1 day, 7 days, 30 days) sent to the API; pending links show role and expiry (D5); verify with a test of the request body

## 4. Polish and docs

- [x] 4.1 Strings in the five catalogs; verify `node scripts/i18n-check.mjs`
- [x] 4.2 Stories for owner, member, the groups editor and phone width, in both themes; regenerate baselines in the pinned Playwright image; verify `make ui-check` in CI
- [x] 4.3 `docs/workspaces.md` and CHANGELOG under Unreleased; verify `make docs-check`
- [x] 4.4 `make check` with TZ=UTC and `make openspec-validate`; open the pull request and get CI green
