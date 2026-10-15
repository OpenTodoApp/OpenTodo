# Design

## Context

See proposal.md (Why) and `UX-AUDIT.md` for the evidence. The relevant facts for the approach:

- `Shell.tsx` wraps every view in one scrolling `div`; `TaskListView`, `CalendarView`, `FilterView`, `SavedViewView` and `DashboardView` each mount their own `TaskDetail` as a static flex sibling inside that scroller. The sidebar is a scrolling container with a second scroller (`nav[aria-label=Projects]`) inside it that also holds the Labels group.
- `Properties.tsx` renders thirteen `PropertyRow`s unconditionally; the editors (`DueField`, `DateField`, `RecurrenceField`, `RemindersField`, `EstimateField`, `ZoneControl`) are independent components with their own layouts.
- Shortcuts are handled by nineteen separate `keydown` listeners; `web/src/lib/shortcuts.ts` is a flat descriptive table that generates `docs/keyboard.md` and the `?` overlay, but no code reads it to dispatch.
- Settings: `settingsSections.ts` is a single table driving overview, side nav and routes; `SettingsView` renders two different layouts (overview list vs section page); 30 panels use `SettingsSection`, four build their own.
- The design system has tokens, contrast and lint tests scoped to `web/src/ui`, an empty barrel `web/src/ui/index.ts`, 36 stories (none for the core screens), and the `REDESIGN_ALLOW_LIST` mechanism in `lint.test.ts` already supports a shrinking per-file allow-list.
- Open changes under `openspec/changes/` (18) touch `web/src/app`; they will conflict with this work unless the shell and template land first.

Constraints: local-first (every write stays an op through `mutate()`), keyboard-first, no new dependencies, WCAG 2.2 AA in both themes from 360 px, the existing automated layout check (`web-app` "Automated layout check") and UI check keep running.

## Goals / Non-Goals

**Goals:**
- One layout model (`app-shell`) that every view renders into, with the panel owned by the shell.
- Progressive disclosure in the task panel without changing the task model or any op.
- One registry as the source of truth for shortcuts, dispatch and documentation.
- One settings presentation and a smaller section map, with redirects for every old address.
- Token and primitive compliance enforced in `web/src/app`, and the core screens under visual regression.
- A sequence that keeps the app shippable after every group of tasks.

**Non-Goals:**
- New task fields, new views or new integrations.
- Changing the data model, the op schema, the REST API, the CLI or the extension.
- A visual redesign of the brand (tokens, accent, typeface stay).
- Rewriting the help content beyond the landing, the keyboard guide, the settings guide and the renamed words.

## Decisions

### D1. The shell owns the layout and the panel
A new `AppShell` renders three fixed columns in a `grid` with `h-dvh`; each column is `min-h-0 overflow-y-auto`. The panel slot reads `?task=<id>` (already the notification link format) and a shell-level `panel` signal for non-task occupants (project activity, project history, calendar planning list). Views stop mounting `TaskDetail`; they call `openTask(id)` from `signals.ts`, which already exists as `openTaskInList`. `/task/<id>` renders the same `TaskDetail` as the content column with a Back action.

*Why not fix each view's scroller?* Five views duplicate the panel mount today and three more will (dashboards, saved filters, calendar planning). One owner removes the class of bug the audit found and gives every view the panel for free.

*Alternative considered*: `position: sticky` on the existing panel. Rejected: it keeps four scrollers and the page scroller, and sticky inside a flex scroller is unreliable on iOS Safari (the reason `Dialog` already scrolls its overlay).

### D2. Sidebar is one scroller with pinned ends
The sidebar becomes `grid-rows-[auto_1fr_auto]`: pinned top (name, primary items, More), scrolling middle (Filters, Projects, Labels as `SidebarGroup`s), pinned footer (Help, search, notifications, sync dot, account, collapse control). Project rows, label rows and filter rows use one `SidebarItem` primitive. Promoted destinations and density come from the appearance preferences (D8).

### D3. Page template as primitives, enforced by lint
`PageHeader` (title, meta, actions, overflow, help) and `PageBody` (`width: 'list' | 'form' | 'full'`) live in `web/src/ui/patterns`. A unit test walks `web/src/app` and fails on any `<h1` outside `PageHeader`, in the same style as the token lint. The phone bar is rendered by the shell from the `PageHeader` props (title and the first two actions), so a view declares its header once.

### D4. Task panel: chips plus an Add menu
`Properties.tsx` is replaced by `PropertyChips`: a wrapping row of `PropertyChip`s for properties with a value, with Do on and Priority always present, and an `AddPropertyMenu` listing the rest with their shortcuts. `PropertyRow`'s read/edit/focus behaviour is kept as the chip's behaviour (click or Enter opens, Escape or commit closes, focus returns). The existing editors are reused inside popovers; the `WhenControl` composes `DueField`, `DateField` (start, deadline), the Someday and Evening toggles, `RecurrenceField` and `RemindersField` as segments of one popover with a shared header and footer. No op changes: each segment writes exactly the field it wrote before.

*Why chips over rows with hidden empties?* Hidden rows still read as a form; chips read as a summary and match the row's metadata language, so the list and the panel tell the same story.

### D5. Shortcut registry and dispatcher
`web/src/lib/shortcuts.ts` becomes the registry: each entry gains `scope`, `action` (a function or a signal) and optional `when`. A single `useShortcutDispatcher` in the shell listens to `keydown`, computes the active scope stack from focus and route (`global` → `view:<name>` → `list` | `board` | `calendar` → `panel` → `editor`, plus `vim` when on), and runs the innermost match. Views register their scope's actions through a `useShortcutScope(scope, handlers)` hook and stop adding listeners. The conflict test and the `docs/keyboard.md` generator read the same table; the cheat sheet renders it grouped by the existing `section`, context first. The Vim layer registers its bindings in the `vim` scope with `g` shared.

*Alternative considered*: keep listeners and only add a conflict test over the descriptive table. Rejected: the table would still not be what runs, so it would drift again.

### D6. Settings: one layout, nine sections, redirects
`settingsSections.ts` is re-cut to nine sections and four groups; each old id maps to a new id and an optional anchor (`security → account#security`). `SettingsView` renders one layout: `SettingsList` (profile, search, groups) as the left column from 1024 px or the whole screen below, and the section page. The search index is built from `SettingsSection` and `SettingRow` labels and descriptions at render time via a registry the primitives write into; the palette reads the same index. Every panel is migrated to the fixed `SettingsSection` anatomy; the four hand-built panels (`HistoryPanel`, `InviteLinksSection`, `RestoreSection`, `Sections`) adopt it. The demo note becomes a page banner plus `disabled` controls.

### D7. Metadata language and row
`TaskRow` is rewritten around three chip components (`ToneText`, `LabelChip`, `NeutralChip`) and a fixed leading slot; the board card is a `TaskCard` variant of the same data. Group headers come from one `ListGroupHeader`. The duration filter moves into a `FilterMenu` in the page header; the assistant one-liner and composer leave Today (the `in-app-assistant` delta). Completion animation uses the motion tokens and a `prefers-reduced-motion` guard; the Undo toast reuses `bulk/toastStore.ts` and the existing `UndoToast`, generalised to one action.

### D8. Preferences are additive
Density (`density: 'comfortable' | 'compact'`) and promoted destinations (`sidebar: string[]`) are added to the appearance preferences record with the same storage and sync as mode and theme (`appearance-preferences` spec: unknown values ignored, stored value kept). The first-run card state (`firstRun: 'done'`) is stored alongside. `project.icon` is a new additive project field: added to the op `Schema` in `internal/sync/ops.go`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; it is not a content field (an icon name, never user text), so it is not added to the E2EE field lists. No field is renamed or removed.

### D9. Tooltip, Skeleton and the end of `title=`
`Tooltip` is a small overlay primitive built on the existing `overlay/position.ts` (hover 400 ms, focus immediate, `aria-describedby`, no open on coarse pointers). `IconButton` wraps its label in it by default. A lint over `web/src/app` fails on `title=` except for a `tooltip-lint-allow` marker used by the QR code and the colour swatches. `Skeleton` is three shapes with a shimmer that `prefers-reduced-motion` stops.

### D10. Lint and budget enforcement
`lint.test.ts` is extended to `web/src/app` with `NOT_YET_MIGRATED` seeded with today's file list and a test that the list only shrinks; it gains checks for raw text sizes (`text-xs`, `text-sm`, `text-[Npx]`), raw radii, raw shadows, legacy classes and `title=`. A `budget.test.tsx` renders the core-screen stories' fixtures and asserts: vertical scrollers ≤ 3 with the panel open, chrome rows above the first task ≤ 2, visible property chips on an empty task ≤ 7, primary sidebar items ≤ 6. `openspec/config.yaml` gains a `design` rule asking every change that touches a screen to state how it stays inside the budget.

### D11. Vocabulary
Renames are presentation only: the sidebar group "Views" → "Filters", the feed "Activity" → "Updates" (route `/updates`, `/activity` redirects), Settings → You → Activity splits into "Sessions" (Account) and "Audit log" (Server), the project header's "Activity" and "History" disclosures become panel-slot occupants opened from the overflow menu, and the panel labels become Do on, Start, Deadline, Evening. Filter query keywords, ops, routes of saved views and API fields do not change.

### D12. Sequence that keeps the app shippable
Tasks are grouped so each group leaves `make check` green and the app usable: (1) shell and scroll model plus the quick wins; (2) primitives, lint and budget; (3) task panel; (4) navigation, naming and page template adoption in every view; (5) settings; (6) shortcut registry; (7) phone patterns; (8) rows, cards, motion, stories and baselines. Groups 3 to 6 can run in parallel after 2.

## Data model impact

Additive only: `preferences.density`, `preferences.sidebar`, `preferences.firstRun` in the appearance preferences record; `project.icon` (string, icon name) in the op schema with a default of `null`. No op field is renamed or removed; older clients ignore the new fields (the `appearance-preferences` spec already requires it; the project schema is additive by rule 3 of AGENTS.md).

## Dependencies, size and memory

No new dependency. Expected effect: the main bundle shrinks by the removed legacy CSS, duplicated panel mounts and the flat shortcut listeners; the help bundle stays lazy and is split per guide page (smaller first load of Help). Container image and server memory are unchanged (no server code beyond the additive schema entry).

## Risks / Trade-offs

- [Eighteen open changes conflict with the shell and template] → Land groups 1 and 2 first and rebase open changes on them; the page template makes most rebases mechanical (wrap in `PageHeader`/`PageBody`).
- [Progressive disclosure hides properties power users set often] → Do on and Priority are always present; the Add menu shows shortcuts; chips appear in a fixed order so muscle memory holds; the cheat sheet lists every property shortcut.
- [Renames break bookmarks and habits] → Every old route and settings id redirects with `replace`; the palette matches old words ("activity", "views") as aliases for one release.
- [Visual baselines churn during the programme] → Core-screen baselines are added in group 8, after the layout settles; earlier groups rely on the layout check and the budget test.
- [Scope dispatcher regressions in rarely used shortcuts] → The registry conflict test plus a dispatch test per scope (table-driven from the registry) replace the per-listener tests; the Vim layer keeps its own tests.
- [Phone tab bar steals 56 px] → It hides while a sheet or the panel is open and on scroll down; the net first-screen gain from removing chrome rows is larger.
- [Removing the assistant hint from Today lowers discovery] → The Integrations section and the first-run card's "Show me around" sample mention it; the palette lists "Set up the assistant".

## Migration Plan

Client-only, shipped as ordinary releases. Each group is a mergeable state. Old addresses redirect in place. Device-local state that changes shape (`ot.taskTab`, collapsed groups) keeps its keys. No data migration. Rollback is a client rollback; the additive preference and project fields are ignored by older clients.

## Open Questions

- Whether "Do on" or "Due" tests better as the label of the main date chip; the spec says Do on, the implementation keeps the string in one place so the word can change without touching behaviour.
- Whether the sidebar collapse-to-icons mode should also be the default below 1024 px on tablets; deferred until the shell story exists at 768 px.
