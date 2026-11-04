# Tasks

## 1. Primitives (PR 1)

- [x] 1.1 `web/src/ui/RadioGroup.tsx` with `cards` and `list` variants (D7), exported from `ui/index.ts`, with stories in light and dark at 1280 and 375 px; verify `radioGroup.test.tsx` (arrow keys move choice and focus, Tab leaves at the chosen option, disabled option skipped with its reason read) and `make ui-check`
- [x] 1.2 `web/src/ui/NumberInput.tsx` (unit inside the field, range error through `Field`, optional "No limit", numeric keyboard, arrow-key steps) with stories; verify `numberInput.test.tsx` (out of range is invalid and shows "Between 1 and 500 MB", No limit clears and disables) and `make ui-check`
- [x] 1.3 `web/src/ui/patterns/SaveBar.tsx` and `useDraft(saved)` (draft, set, dirty, reset, invalid), with a story; the bar shows only while dirty and disables Save while invalid or offline; verify `saveBar.test.tsx`
- [x] 1.4 UI lint refuses `type="radio"` under `web/src/app`, with an allow-list of today's eight files (the six settings files plus NewBoardDialog and TaskPageDialog, which leave the list with `settings-patterns` or their own change); verify `make ui-lint` fails on a new raw radio and passes on main's files
- [x] 1.5 `npm test` and `npm run build` in `web/`; `make bundle-budget` unchanged (Settings is lazy)

## 2. Page head, heading rank, scope, switch rows (PR 2)

- [x] 2.1 `scope?: 'server' | 'device'` on `SettingsPage` and `SettingsSection` in `settingsSections.ts`, with People and Server pages defaulting to `server` and Calendar grid set to `device` (D4); verify `settingsSections.test.tsx` lists the scope of every page
- [x] 2.2 A `lead` entry per section and sub-page in `lib/settingsCopy.ts` (at most 90 characters, settings copy lint), strings in the five catalogs; verify `make i18n-check` and the settings copy lint
- [x] 2.3 `SettingsView` renders the page head on every page and width: the title from 1024 px, the lead line, the scope line ("Applies to everyone on this server" / "This device only"), and optional status and action slots (D1); verify `settingsSections.test.tsx` (sub-page lead line, phone lead line, server and device scope lines)
- [x] 2.4 `SettingsSection` heading as `text-body font-semibold text-strong` and the larger gap between sections (D3); `bare` mode with no heading and no line, labelled by the page title (D2); `SettingsPageContent` passes `bare` when the page renders one panel; verify the anatomy test's new checks (no section heading equal to the page title, a lead line on every page) and the One-section page scenario on Backups and Voice capture
- [x] 2.5 The "This server" badge after the label of an owner's switch row (`SettingRow scope="server"`) on a personal page (MCP owner switches, CalDAV, Delivery channels, Calendar feeds, Calendar sync, Issues, the private-network policy on Webhooks; the Assistant already heads its owner rows); verify the anatomy test finds the badge on each
- [x] 2.6 `SettingRow` keeps a switch on its label's line below 640 px (element-type detection, `inline` and `stack` props) (D6); verify `settingRow.test.tsx` and the anatomy test's list of switch rows that still stack (empty)
- [x] 2.7 `node scripts/ux-audit/settings-heights.mjs` against a built server: no page grows past 1.5 screens, and the phone pages with switches are shorter than on main. Measured 2026-11-04 (main `97346497` against this branch, 53 pages): 390 px total 54,446 → 53,756 px (−1.3%), 1280 px total 47,472 → 47,540 px (+0.1%); with switches, Profile −206, Focus timer −178, AI assistants −139, Assistant −138, Push −105 px on a phone; People → Users kept at 1.5 screens by a shorter lead line; no page crossed 1.5 screens
- [ ] 2.8 Screenshot baselines: inspect every changed settings story diff (no error state, no empty mock), then accept; verify `make ui-check` in CI

## 3. Tones and the save rule (PR 3)

- [ ] 3.1 The tone rule (D5) in the panels that compute a state: Backups (no run yet → warn), Outgoing email (not configured → warn), Security and Account (two-factor off → warn), Push (permission blocked → warn), Webhooks (failing → danger); verify each panel's test asserts the tone
- [ ] 3.2 Overview state loaders return `{ text, tone }`; rows render a status dot for warn and danger, plain text otherwise; verify the Warning on the overview scenario in `settingsOverview.test.tsx`
- [ ] 3.3 Single controls save on change: Attachments' switch no longer waits for Save, Branding's name moves to the save bar while logo and themes stay immediate, the audit settings follow the rule; a failed save reverts and shows the error under the row; verify the panels' tests (A switch saves at once, Failed save)
- [ ] 3.4 Save bar and leave guard (`setLeaveGuard`) on Attachments limits, Focus timer, Workspaces name and colour, Outgoing email, SSO, Speech to text, audit retention; verify the Save bar on a form and Leaving with unsaved changes scenarios
- [ ] 3.5 Replace raw radios with `RadioGroup` in QuickAddSettings, AssistantsPanel, TokensSection, BackupsPanel, RestoreSection and assistant/AssistantSettings, and raw number fields with `NumberInput` in AttachmentSettingsPanel, BackupsPanel, AuditPanel, ClosedListSettings, DefaultRemindersSettings and RemindersField (and the OAuth clients form's raw input and select with `Field`/`Input`/`Select`); remove the six settings files from the lint allow-list; verify `make ui-lint` and each panel's tests
- [ ] 3.6 Docs: the settings anatomy in `docs/design-system.md` (heading rank, one-section pages, page head, scope, switch rows, radio group, number input) and the save rule in `docs/interface-guide.md`; verify `make docs-check`
- [ ] 3.7 `make check`, CHANGELOG entry under Unreleased, ROADMAP row under Design refresh (*Settings structure*)
