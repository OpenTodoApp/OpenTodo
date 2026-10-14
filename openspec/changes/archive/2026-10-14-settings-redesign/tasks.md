# Tasks

## 1. Preconditions and shared patterns

- [x] 1.1 Confirm `design-language` and `ui-primitives` are applied (tokens in `web/src/index.css`, `web/src/ui/` exports `SettingsSection`, `SettingRow`, `Card`, `Switch`, `Badge`, `Avatar`, `EmptyState`, `MenuItem`, `Button`, `Icon`, and Storybook runs); verify with `cd web && npm run storybook -- --smoke-test` (or the workbench command `design-language` defines) and `npm run build`
- [x] 1.2 Confirm `web/src/ui/` exports `ConfirmDialog` and `ListRow` (delivered by `ui-primitives`, tasks 5.2 and 5.3); verify by importing both in a scratch story and running `npm run build` in web/

## 2. Information architecture and routing

- [x] 2.1 Extend `router.ts`: add the ids `security`, `encryption`, `activity`, `preferences`, `projects`, `backups`, `access` to `SETTINGS_SECTION_IDS`, and a `LEGACY_SETTINGS_IDS` map (`general` → `preferences`) used by `parseRoute`; verify with router tests for every id, `/settings/general`, `/settings/import` and an unknown id
- [x] 2.2 Rework `settingsSections.ts`: add `group` and `icon` fields, `SETTINGS_GROUPS` (You, App, Data and connections, Server) in the order of the spec, per-section `visible` (Server group: admins; `backups` and `access`: owner), `demo`/`demoOnly` lists per design D1, and role-aware descriptions; verify with `settingsSections.test.tsx` cases for member, admin and owner order and visibility
- [x] 2.3 In `SettingsView`, replace the address with `history.replaceState` when the route came from a legacy id, so back skips `/settings/general`; verify with a test that opening `/settings/general` leaves `/settings/preferences` as the current entry and no extra history entry
- [x] 2.4 Split `SectionContent` into the fourteen sections per design D1 (panels moved, not yet restyled), split `TwoFactorPanel` into personal and owner `MfaPolicyPanel` (same `settings/two-factor` screen id), and point `ImportScreen`'s back link to Data; verify that a test asserts every former `settings/...` screen id still renders in some section for the owner, and `demo.test.tsx` passes with the per-section demo notes
- [x] 2.5 Change `internal/httpapi/oidc.go` to land the link flow on `/settings/security` (success and both error paths) and update the comment in `SsoPanel.tsx`; verify with the oidc handler tests updated to expect `/settings/security` and `go test ./...`

## 3. Overview and navigation

- [x] 3.1 Build the profile card (Avatar initials, name, email, role Badge) and use it on the overview and in the Account section; verify with a story (owner, member, long name/email at 320 px) and a test that the overview shows name, email and role
- [x] 3.2 Render the overview as grouped `<section aria-labelledby>` lists with h2 group headings and entries (icon, label, description, chevron, ≥44 px), omitting empty groups; verify with a test that a member sees no Server group and with an axe-clean story in light and dark
- [x] 3.3 Render the side navigation (≥1024 px) with group headings, 16 px icons, emerald soft current item with `aria-current="page"`, and keep the phone back link and focus-to-h1; verify with existing focus tests and a story at 1280 px and 375 px

## 4. You: Account, Security, Encryption, Activity

- [x] 4.1 Account: profile card plus Session card with "Sign out of this device" through `ConfirmDialog`, and a row linking to Security; verify with tests that sign-out runs only after confirm and Cancel returns focus to the button (web-app delta scenarios)
- [x] 4.2 Password: `SettingRow` with "Change password" opening an inline expansion containing the existing form; verify with a test that no password fields render until the action is activated and Escape/cancel restores focus
- [x] 4.3 Two-factor: summary (On/Off badge, "N of 10 recovery codes left", warning at ≤3 with promoted "New recovery codes"), enrolment in a `Dialog`, remembered browsers as `ListRow`s, disable in the danger area via `ConfirmDialog`, owner link to Access policies; verify with `TwoFactorPanelView` stories (off, on, few codes, offline) and tests for the summary text and the offline state
- [x] 4.4 Passkeys: summary count, `ListRow` per passkey (created, last used, suspicious badge, Rename/Remove menu), empty state with "Add passkey", removal through `ConfirmDialog`; verify with `SecurityPanel.test.ts` updated and stories (none, two, suspicious)
- [x] 4.5 Linked accounts: identities as `ListRow`s, link action, empty state, and `?linked`/`?error` confirmation on `/settings/security`; verify with a test rendering the linked and error states
- [x] 4.6 Encryption: state badge summary (off / on / locked on this device), actions by state, reset in the danger area through `ConfirmDialog`; verify with `encryptionPanel.test.tsx` updated and stories per state
- [x] 4.7 Activity: Recent activity as `ListRow`s (icon per event kind, relative time, agent and IP secondary, failure tint) and the owner's Audit log card; verify with `ActivityView` and `AuditPanel.test.ts` updated, the offline notice still shown, and a member seeing no Audit log
- [x] 4.8 Update docs for this group (`docs/account-security.md`, `docs/e2ee.md`, `docs/settings.md` You section, every "Settings → Account → …" that moved to Security/Encryption/Activity); verify with `make docs-check`

## 5. App: Preferences, Notifications, Capture, Projects

- [x] 5.1 Preferences: Start view, Calendar and Keyboard as `SettingRow`s (select, numeric rows, Vim `Switch` with `role="switch"`), with a slot for the `date-time-preferences` panel; verify with tests that each control still writes the same per-device preference and a 320 px story without horizontal scroll
- [x] 5.2 Notifications: summary ("On/Off on this device", permission badge, last delivery line) and rows, keeping the existing actions; verify with a `NotificationsSettings` story per permission state and existing tests passing
- [x] 5.3 Capture: Quick add languages and Voice as rows, bookmarklet and extension card, Email to task summary with copy action and demo note; verify with `emailInbox.test.tsx` updated and the demo test for Capture
- [x] 5.4 Projects: auto-archive row (switch plus delay) and archived projects as `ListRow`s with Restore and an empty state; verify with `archivedProjects.test.tsx` updated and the project-organization scenarios (sorted list, restore) still passing
- [x] 5.5 Update docs for this group (`docs/settings.md` App section, `docs/keyboard.md`, `docs/quick-add.md`, `docs/capture.md`, `docs/email.md`, `docs/notifications.md`, `docs/time-blocking.md`, every "Settings → General → …"); verify with `make docs-check`

## 6. Data and connections: Data, Integrations, AI

- [x] 6.1 Data: Export and Import rows, sync summary, and for the owner a row linking to Backups; verify with tests for member and owner Data sections and the demo import note
- [x] 6.2 Integrations: CalDAV summary with copy and app passwords as `ListRow`s; webhooks list with last-delivery badge; tokens list with scope badge; each "New …" in a `Dialog` whose success step shows the one-time secret with copy; revokes through `ConfirmDialog`; verify with `caldavSettings.test.tsx` and token tests updated, the "Token shown once" scenario, and the empty state for no tokens
- [x] 6.3 AI: Assistant summary or owner configuration behind "Configure", AI assistants as switch rows plus token action; verify with `assistantSettings.test.tsx` and `assistantsSettings.test.tsx` updated and the read-token-preselected scenario
- [x] 6.4 Update docs for this group (`docs/import-export.md`, `docs/caldav.md`, `docs/webhooks.md`, `docs/api.md`, `docs/mcp.md`, `docs/assistant.md`, `docs/ai-and-agents.md`); verify with `make docs-check`

## 7. Server: Administration, Backups, Access policies

- [x] 7.1 Administration: config warnings, Users as `ListRow`s with role and status badges and per-row menu (keeping `onRowKey`), Members and invitations list with "New invitation" in a `Dialog`, delete and revoke through `ConfirmDialog`; verify with UsersView tests (admin sees member actions only) and invitation tests updated
- [x] 7.2 Backups: summary (last run time and outcome badge, next run), destinations and schedule as rows, recent runs as `ListRow`s; verify with `backupsScreen.test.tsx` updated and a story per outcome
- [x] 7.3 Access policies: two-factor policy select row, project invite links switch row, single sign-on summary with configuration behind "Configure" (env-locked fields kept); verify with `projectInvite.test.ts` and the SSO panel tests updated and an admin opening `/settings/access` seeing the overview
- [x] 7.4 Update docs for this group (`docs/backups.md`, `docs/self-hosting/sso.md`, `docs/sharing.md`, `docs/self-hosting/demo.md`, every "Settings → Administration/Data → Backups"); verify with `make docs-check`

## 8. Integration checks

- [x] 8.1 Update `scripts/e2e-layout.mjs` to iterate all fourteen sections and the overview at 320, 390 and 1280 px, and `scripts/docs-screenshots.mjs` paths and headings; verify with `make layout-check` passing with no horizontal overflow
- [x] 8.2 Regenerate help and screenshots (`make docs`, `make docs-screenshots`) and confirm every `settings/...` screen id resolves; verify with `make docs-check` and `make docs-site-check`
- [x] 8.3 Run the Storybook gates from `design-language` (axe, visual regression light/dark at 375 and 1280) for every settings story; verify the gate command passes with zero axe violations and approved baselines
- [x] 8.4 Manual keyboard pass: overview → each section → each action and dialog without a mouse, focus visible throughout, and a screen reader announcing group headings; record the result in the PR description
- [x] 8.5 Run `make check` and `npx @fission-ai/openspec validate --all --strict`; both pass

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased ("Settings: grouped into fourteen sections with a clearer layout").
- Archive the change with `/opsx:archive` after review, then confirm `openspec validate --all --strict` passes.
