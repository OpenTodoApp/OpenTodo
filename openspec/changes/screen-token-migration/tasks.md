# Tasks

## 1. Lint scaffolding

- [x] 1.1 Extend `web/src/ui/tokens/lint.test.ts` to scan `src/app/**/*.tsx` (excluding tests and `*.stories.tsx`) and the `@layer components` block of `src/index.css`, and add `white`/`black` colour utilities to the raw-class regex. Verify with new unit cases in the "detects raw classes" test (`bg-white`, `dark:bg-black/40`, an `@apply` line) and `npm test`.
- [x] 1.2 Add the redesign allow-list (D3: the four `labels-and-menus` files, each commented with its owning change) and a test that fails if the list grows beyond those entries. Verify `npm test` passes and fails when an extra entry is added.
- [x] 1.3 Add the temporary "not yet migrated" list containing every file the new scope currently reports, so the suite is green before any migration. Verify `npm test` and `npm run build` pass, and removing one entry makes the lint name that file's lines.
- [x] 1.4 Document the screen rule and the D1 mapping table (meaning to token, accent against success) in `docs/design-system.md`. Verify `make docs-check` passes.

## 2. New tokens

- [x] 2.1 Add the scrim and highlight tokens (light, system dark and `data-theme="dark"` blocks, mapped in `@theme inline`) and any calendar grid token, with new text pairs in `src/ui/tokens/pairs.ts`. Verify `theme.test.ts` (dark blocks identical, every token has a dark value) and `contrast.test.ts` pass with `npm test`.
- [x] 2.2 Show the new tokens in the Foundations colour story. Verify `npm run build-storybook` succeeds and the story lists them.

## 3. Shell and navigation

- [x] 3.1 Migrate `Sidebar`, `Shell`, `SyncStatus`, `NotificationBell`, `QuickAdd` and `ReminderToasts` by D1 and drop them from the "not yet migrated" list. Verify `npm test` and `npm run build`, and compare `scripts/screenshots.mjs` before/after shots (today, mobile-dark, quick-add, notifications) in light and dark: only shade differences.

## 4. Lists, rows and views

- [x] 4.1 Migrate `TaskRow`, `TaskListView`, `BoardView`, `FilterView`, `SavedViewView`, `DashboardView`, `SubProjects`, `ArchivedProjects`, `TrashView` and `ProjectActivity`, splitting emerald into accent (selection, actions) and success (completion). Verify `npm test`, `npm run build`, and before/after shots (project, board, filter, dashboard, trash) in both themes.
- [x] 4.2 Migrate the task panel (`app/task-detail/*`, `HistoryPanel`, `DueField`, `RemindersField`, `AssigneePicker`, `LabelPicker`), keeping its redesigned layout. Verify the task-detail tests, `npm test`, `npm run build`, and before/after shots of the task detail in both themes.
- [x] 4.3 Migrate `FeedView` and render project dots through `hueFor`/`data-hue`, with the `slate` hue for projects without a colour (D4). Verify a unit or interaction test that a project stored as `#3b82f6` renders with `data-hue="blue"` and no inline stored hex, plus `npm test` and `npm run build`.

## 5. Calendar and time blocking

- [x] 5.1 Migrate `CalendarView` and its time-blocking parts, use the calendar grid token, and render task blocks through `hueFor`/`data-hue` instead of the raw stored hex border (D4). Verify a test for the project hue on a calendar block, `npm test`, `npm run build`, and before/after shots (upcoming, week, day) in both themes.

## 6. Auth, invite and reset screens

- [x] 6.1 Migrate `AuthScreen`, `ResetScreen`, `InviteScreen`, `ProjectInviteScreen`, `NamePrompt`, `UnlockScreen`, `ArchivePrompt`, `ReauthDialog` and `ErrorBoundary`, with error text on the danger tokens. Verify the existing `AuthScreen.*.test.ts`, `ResetScreen.test.ts` and `InviteScreen.test.ts` pass, `npm run build`, and a before/after look at the sign-in and setup screens in both themes.

## 7. Settings panels

- [x] 7.1 Migrate the settings panels and sections (`InviteLinksSection`, `TwoFactorPanel`, `SecurityPanel`, `TokensSection`, `PasswordSection`, `EncryptionPanel`, `MembersPanel`, `ShareDialog`, `ConfigWarnings`, `AuditPanel`, `BackupsPanel`, `CaldavPanel`, `EmailInboxPanel`, `SsoPanel` and the remaining `*Settings.tsx`/`*Panel.tsx`). Verify `npm test` and `npm run build`.
- [x] 7.2 Regenerate the settings story baselines through the "UI baselines" workflow (or `make ui-baselines` with Docker) and review every diff image. Accept only shade changes, and commit the new baselines. Verify `make ui-check` passes on the result.

## 8. Remaining screens and component classes

- [x] 8.1 Migrate `ImportScreen`, `help/HelpView`, `ShareCapture`, `Markdown`, `ShortcutHelp`, `NotesEditor` and every other file still on the "not yet migrated" list, using the scrim token for overlays. Verify `npm test`, `npm run build`, and before/after shots (help, share, history-free screens) in both themes.
- [x] 8.2 Migrate the `@layer components` classes in `src/index.css` (`.notes-editor`, `.help-prose`, task checkbox, `mark` with the highlight token). Verify the lint's CSS pass reports nothing and a before/after look at notes, help and search highlighting in both themes.
- [x] 8.3 Delete the "not yet migrated" list, leaving only the redesign allow-list. Verify `npm test` passes with the list gone.

## 9. Integration

- [x] 9.1 Run the layout check across every screen (`make layout-check`, Chromium and WebKit). Verify it passes with no new overflow or overlap.
- [x] 9.2 Run `make check`. Verify it passes, including lint, tests, ui-lint, docs-check and `openspec validate --all --strict`.
