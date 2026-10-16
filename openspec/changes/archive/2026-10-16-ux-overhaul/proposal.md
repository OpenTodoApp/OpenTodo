# Proposal

## Why

OpenTodo has shipped every roadmap capability, and the interface has grown one feature at a time until it reads as bloated: every property, filter and destination is always visible, a task open on a desktop produces four nested scroll regions, each screen is laid out on its own, the design system is only half applied in the screens, and the vocabulary is overloaded (four things called "Activity", six ways to say when). `UX-AUDIT.md` documents the causes with evidence and about ninety concrete improvements. This change turns that audit into behaviour contracts so the interface can be rebuilt as one programme, before the eighteen open changes add more rows and chips on top of the old model.

## What Changes

- **App shell**: three fixed columns (sidebar, content, panel) that each scroll alone; the task panel is owned by the shell and reachable by address; one page template (header, content width, one title size) for every view; no desktop top bar; sync status as a dot; notices as toasts; a sidebar with five primary destinations, a "More" group, Projects, Labels and Filters in one scroller, and a pinned footer; a bottom tab bar and a floating add button on phones.
- **Task panel**: progressive disclosure (title, notes, set properties as chips, an "Add" menu for the rest), one unified "When" control for due, start, deadline, evening, repeat and reminders, a sticky header with the checkbox and title, a pinned comment composer, a compact attachments affordance, and the panel as a full page on demand.
- **Lists, rows and boards**: one row anatomy with a fixed leading slot in every view, a three-style metadata language, one group header, empty groups and "No section" hidden, duration filters behind a filter action, no promotional banners, a completion animation and an Undo toast for single actions, a board that is its own scroller and pages on phones.
- **Calendar**: uses the page template; the planning list lives in the panel slot; the week becomes an agenda on phones.
- **Settings**: one presentation at every width (section list beside content from 1024 px, list-then-page below), nine sections instead of fourteen, settings search, one Help action per page, a fixed section and row anatomy, disabled rather than hidden controls on the demo.
- **Keyboard shortcuts**: a scoped shortcut registry with conflict detection that renders the cheat sheet, the keyboard guide and the palette hints; a cheat sheet grouped by context, searchable, that fits the screen; printed shortcut badges replaced by tooltips, with a preference to show hints.
- **Help and first run**: Help opens on search and task-shaped entries; every page has a Help action; a three-step first-run flow with a sample project.
- **Design system and process**: `PageHeader`, `Tooltip` and `Skeleton` primitives; three surfaces; token lint extended to the screens; the eight core screens in the workbench with baselines; a UI budget every change must state; the legacy classes removed once migrated.
- **Vocabulary**: the shared-project feed becomes "Updates", the audit log and sessions get their own names, saved views become "Filters", the when-fields are named Do on, Start, Deadline and Evening.

No data model, op schema or API changes. No new environment variables. Not **BREAKING**.

**Out of scope**: new features (the open changes such as `custom-fields`, `habits`, `month-and-timeline-views` stay separate), the marketing website, the CLI and the browser extension, user testing and copy review beyond orientation, performance work beyond what the shell change implies. ROADMAP.md item advanced: none directly; this is the "set a new standard for to-do app UI/UX" goal and a precondition for every item under "Parity and depth".

## Capabilities

### New Capabilities
- `app-shell`: the fixed three-column layout and its scroll model, the sidebar structure, the page template every view renders, the panel slot and its address, status and notices, and the phone navigation (tab bar, floating add).
- `keyboard-shortcuts`: the scoped shortcut registry, conflict detection, the cheat sheet, shortcut hints and the hint preference.
- `task-list-presentation`: the task row anatomy, the metadata language, group headers, empty groups, density, completion feedback and single-action undo in every task list and board.
- `first-run`: what a new account sees on its first visit.

### Modified Capabilities
- `web-app`: Task detail panel, Keyboard navigation, Responsive layout and themes, Task panel layout, Task panel tabs (the panel becomes progressive and shell-owned; phone navigation changes).
- `design-system`: Comfortable reading scale, Legacy component classes follow the tokens, Settings section and row patterns; new requirements for the page template, tooltip and skeleton primitives, three surfaces, token lint on screens, core-screen stories, the UI budget.
- `settings-navigation`: Settings sections and routes, Settings overview, Section page layout, Sections follow the user's role, Demo instance sections, Help links name the same screens, Settings groups, Legacy settings addresses, Panel cards and rows; new requirement for settings search.
- `documentation`: Help inside the app, Contextual help.
- `command-palette`: Discoverability and help; new requirement for sections and recents.
- `sections-and-boards`: Sections in the list view, Board view.
- `time-blocking`: Day and Week calendar views, Duration filter.
- `subtasks`: Nested display in lists.
- `custom-views`: Pinned views in the sidebar.
- `filter-queries`: Filter view.
- `project-organization`: Project tree in the sidebar, Sub-projects inside a project view.
- `labels`: Label views and counts.
- `task-assignment`: Assigned to me view, Show in Assigned to me.
- `activity-feed`: Cross-project feed, Unread indicators in the sidebar.
- `start-dates`: Setting when from the panel and the keyboard.
- `deadlines`: Deadline entry.
- `attachments`: Attachments in the task detail.
- `comments`: Comment thread in the client.
- `voice-capture`: Opt-in per device.
- `natural-language-capture`: Live preview chips.
- `appearance-preferences`: Appearance in Settings.
- `in-app-assistant`: Ask composer.

## Impact

- **Code**: `web/src/app` almost entirely (Shell, Sidebar, TaskListView, TaskRow, TaskDetail and task-detail/*, BoardView, CalendarView, SettingsView and every settings panel, ShortcutHelp, help/*, palette/*, QuickAdd), `web/src/ui` (new primitives, barrel, lint scope), `web/src/lib/shortcuts.ts` (becomes the registry), `index.css` (legacy classes removed at the end), `web/src/ui/__screenshots__` (new baselines), `docs/` user guide pages (Help landing, keyboard guide, settings guide, vocabulary), `openspec/config.yaml` (UI budget rule), `scripts/ui-check.mjs`.
- **Server and API**: none. All changes are client presentation; every write keeps going through `mutate()` and the op log.
- **Dependencies**: none added. Bundle size is expected to fall slightly (legacy CSS and duplicate panel mounts removed); the help bundle stays lazy.
- **Routes**: the settings section ids change (old ids redirect), the task panel gains an address (`?task=<id>` already exists and becomes the canonical one), `/activity` is renamed with a redirect. Bookmarks keep working.
- **Open changes**: every open change that touches `web/src/app` must be rebased on the new shell, page template and panel; the proposal recommends landing groups 1 and 2 of tasks.md before any of them.
