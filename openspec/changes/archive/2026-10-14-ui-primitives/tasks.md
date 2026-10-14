# Tasks

Prerequisite: `design-language` is applied (tokens in `@theme`, Storybook in `web/.storybook`, axe and visual-regression gates in CI). Frontend tasks are verified with `npm test` and `npm run build` in `web/`, in addition to the check each task names.

## 1. Scaffolding and baseline

- [x] 1.1 Create `web/src/ui/` with `index.ts`, `icons/`, `patterns/`, `Combobox/`; verify `npm run typecheck` passes and Storybook lists an empty "UI" group
- [x] 1.2 Record the baseline bundle size (gzipped entry and lazy chunks from `npm run build`) in design.md D11 "Measured"; verify the numbers are committed

## 2. Icons

- [x] 2.1 Add `scripts/icons-sync.mjs` (reads a local `lucide-static` tarball or checkout, no network at build) and generate `web/src/ui/icons/lucide.ts` with the D2 list plus `LICENSE-lucide.txt`; verify that re-running the script produces no diff
- [x] 2.2 Implement `Icon` (currentColor stroke, size scale, `aria-hidden` by default, `label` → `role="img"`); verify with unit tests for both modes and an `Icon.stories.tsx` gallery of every icon passing axe in light and dark
- [x] 2.3 Add a unit test asserting every `IconName` is referenced in `web/src` or listed in an allow-list; verify it fails when an unused icon is added

## 3. Buttons and form controls

- [x] 3.1 Implement `Button` and `IconButton` (variants, sizes, `busy` with `aria-busy` and re-entry guard, required `label` on IconButton) with `.ui-btn*` classes in `@layer components`; verify the unit test "double activation runs once" and stories for every variant, size and state
- [x] 3.2 Add `.btn-secondary` aliasing the secondary token style and replace every `btn-ghost border border-slate-300 dark:border-slate-700` occurrence; verify with `grep -rn "btn-ghost border border-slate-300" web/src` returning nothing and the layout check (`node scripts/e2e-layout.mjs`) passing
- [x] 3.3 Implement `Field`, `Input`, `Textarea`, `Select` (label, description and error wired via `aria-describedby`/`aria-invalid`); verify with a unit test that the error text is in the accessible description and with stories for default, error and disabled
- [x] 3.4 Implement `Switch` (`role="switch"`, `aria-checked`) and `Checkbox` (including indeterminate); verify with unit tests for keyboard toggling (Space) and announced state, plus stories

## 4. Surfaces and data display

- [x] 4.1 Implement `Card`, `Badge`/`Chip` (solid and soft for all 12 palette hues); verify with a stories matrix passing axe contrast in both themes
- [x] 4.2 Implement `Avatar` with FNV-1a → palette hue and move `initials()` into it; switch `AssigneeChip` to Avatar; verify with a unit test that the same id yields the same hue and initials, and that `AssigneePicker` tests still pass
- [x] 4.3 Implement `Tabs` (roving focus, automatic activation, Home/End); verify with a unit test for Right/Left/Home/End and a story
- [x] 4.4 Implement `EmptyState` and `Timeline` (event and thread kinds, nested replies) as presentational components; verify with stories for empty, single, mixed and long content at 375 px with no horizontal scroll

## 5. Settings patterns

- [x] 5.1 Implement `SettingsSection` (heading level prop, help link via `HelpHeading` logic) and `SettingRow` (grid at ≥640 px, stacked below); verify with stories at 375 and 1280 px and a unit test that the heading level follows the prop
- [x] 5.2 Implement `ConfirmDialog` in `web/src/ui/patterns/` (focus on Cancel, Escape cancels, focus returns to trigger, danger tone ignores outside taps) with stories; verify with unit tests for the spec scenarios "Destructive confirmation by keyboard" and "Outside tap does not confirm or dismiss", and zero axe violations in its stories
- [x] 5.3 Implement `ListRow` in `web/src/ui/patterns/` (leading icon/avatar, label, meta, badges, trailing menu, forwarded key handlers) with stories (default, many badges, long text at 320 px, danger menu item); verify with a unit test for forwarded Enter/Delete handlers and the "List row on a phone" story passing the visual and axe gates

## 6. Menus

- [x] 6.1 Add `kind="menu"` to `app/overlay/Menu` (`aria-haspopup="menu"`, Popover `role="menu"`) with `MenuItem`, `MenuGroup`, `MenuSeparator` and a `useRovingMenu` hook (focus first, ↑/↓ wrap, Home/End, type-ahead, skip disabled); verify with unit tests for the spec scenarios "Arrow keys move through items" and "Type-ahead", and that the existing `overlay.test.ts` passes
- [x] 6.2 Add MenuItem stories (icon, shortcut hint, description, danger last in its own group, disabled); verify that axe passes and that the shortcut appears in the accessible description
- [x] 6.3 Switch `ViewMenu` (ViewsView, reused by Sidebar, SavedViewView, DashboardView) and the section menu (Sections.tsx) to `kind="menu"` with MenuItem markup, keeping their actions; verify with the existing view and section tests plus the layout check. Leave the label menu and the project "Move to" menu as `kind="dialog"` for `labels-and-menus`

## 7. Smart picker (Combobox)

- [x] 7.1 Implement `ui/Combobox/match.ts` (NFD normalisation, exact > word-prefix > fuzzy tiers, highlight ranges, fuzzy needs ≥2 chars); verify with unit tests for "gro sh" → "Grocery shopping" above fuzzy-only matches, and "cafe" matching "Café"
- [x] 7.2 Add the next free Dexie version (v14 unless already taken by `date-time-preferences`) with `pickHistory` (redeclare all stores), `web/src/lib/pickRank.ts` (record and rank with 14-day half-life, 200 rows per context), and clear it in `clearLocalData()`; verify with fake-indexeddb tests that the ranking order holds, that the table is not in `entityTables()` or the outbox, and that it is empty after `clearLocalData()`
- [x] 7.3 Implement `useCombobox` and `<Combobox>`/`<ComboboxSheet>` (sync and async sources, 120 ms debounce, AbortController and request id for stale results, groups, `getPath` hierarchy, create row last, single and multiple, ranking frozen while open, live-region result count); verify with unit tests for "Keyboard picking", "Results are announced", "Stale results ignored", "Create row" and "Empty state"
- [x] 7.4 Add windowing above 200 options with correct `aria-setsize`/`aria-posinset`; verify with a unit test rendering 10,000 options that renders fewer than 60 rows and keeps the active option mounted, and a story whose typing latency stays under 16 ms per keystroke in the Storybook performance panel
- [x] 7.5 Add Combobox stories (people with avatars, labels with colour dots and create row, project tree with paths, async source with loading and empty states, phone sheet at 375 px); verify axe and visual baselines in both themes

## 8. Rebuild the existing pickers

- [x] 8.1 Rebuild `LabelPicker` as an adapter over Combobox (context `label`, create row, colour dots, same props and the same single op on the `labels` array); verify the existing label tests plus new tests for "Recently used label first" and offline assignment with fake-indexeddb
- [x] 8.2 Rebuild `AssigneePicker` as an adapter (context `assignee:<projectId>`, "Unassigned" and "You" pinned first, avatars, same props); verify the existing assignment tests plus "Frequent assignee near the top"
- [x] 8.3 Verify the call sites (TaskDetail inline, TaskListView, FilterView, SavedViewView dialogs) work unchanged, with `npm test` and a manual keyboard pass: `L` and assignee shortcuts on a selected task, Escape returns focus

## 9. App-wide icon swap

- [x] 9.1 Replace sidebar and shell glyphs (Sidebar view emoji, ☰, 🔔, settings, the shared-project SVG) with `Icon`; verify the sidebar tests and the layout check in light and dark
- [x] 9.2 Replace task row and task detail glyphs (✓ ↻ ↳ 💬 ↶ ▸ ▾ ✕) with `Icon`/`IconButton` with accessible names; verify the TaskRow, TaskDetail and boardView tests
- [x] 9.3 Replace field glyphs (DueField, EstimateField, RecurrenceField, RemindersField, ReminderToasts ⏰ ✕ ⇧) and HistoryPanel and ProjectActivity disclosure; verify the existing field tests and `reminderToastFocus.test.ts`
- [x] 9.4 Replace the remaining glyphs (CalendarView ‹ ›, SettingsView › ←, ImportScreen ←, ProjectHeader ⌄, TrashView ○, ViewsView/DashboardView ▦ ≡, LabelsView ⋯, FilterView/TaskListView/DashboardView ↑ ↓, Dialog/Popover/QuickAdd/Help ×, the lock SVGs); verify with `npm test` and the layout check
- [x] 9.5 Add `scripts/ui-check.mjs` (stories exist for every ui component; no emoji or icon glyphs in `web/src/app` JSX outside the copy allow-list) and wire it into `make check`; verify that it passes on the tree and fails when a 🔔 is reintroduced in a scratch edit

## 10. Documentation and integration

- [x] 10.1 Write `docs/design-system.md` sections for icons (how to add one via the sync script, licence), buttons, form controls, menus, Combobox (ranking, matching, sources) and patterns, linked from the Storybook intro page; verify `npm run docs:check` passes
- [x] 10.2 Update AGENTS.md "Layout" and "Conventions" with `web/src/ui/` (primitives only via `ui/`, no emoji icons, entity pickers use Combobox); verify the diff is reviewed alongside the code
- [x] 10.3 Measure the bundle after the change and record the delta in design.md D11 (budget ≤ +20 KB gzipped); verify the recorded numbers come from `npm run build` output
- [x] 10.4 Run `make check` (Go tests, web tests and build, ui-check, Storybook a11y and visual gates, layout check); verify it is green

## Workflow follow-up

- Archive with `/opsx:archive` after review; confirm `npx @fission-ai/openspec validate --all --strict` passes and add a CHANGELOG.md entry under Unreleased.
