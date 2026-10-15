# UX audit, October 2026: from feature-complete to a product that feels light

OpenTodo has shipped its whole roadmap. The result is a task manager that does more than most commercial ones, and an interface that has grown one feature at a time. Every feature is visible at once, every screen carries its own chrome, and the user pays for all of it on every visit. This document is the complete list of what has to change for the app to feel calm, obvious and premium, and to set the standard the project aims for.

It is written to be turned into OpenSpec changes. Every item has an id, evidence, a target and a priority. Section 7 proposes the sequence.

## 1. How this audit was made

- **Code**: the whole `web/src/app` and `web/src/ui` trees, `index.css`, `docs/design-system.md`, the live specs and the archived UI changes (`design-language`, `ui-primitives`, `screen-token-migration`, `task-detail-redesign`, `settings-redesign`, `mobile-layout`, `settings-sections`).
- **The running app**: a fresh build (`make web`, `go build`) seeded over the REST API with 12 nested projects, sections, 8 labels, about 60 tasks with subtasks, due dates, deadlines, estimates, recurrences, comments and two saved views. Every main screen was captured at 1280×800 and 375×812, in light and dark, with the task panel open and closed, and the number of scrolling regions was measured on each.
- **Counts** come from `grep` over `web/src/app` and are reproducible; they are quoted where they change a decision.

What was **not** done: user testing, performance profiling, and a review of copy beyond what affects orientation. Those belong in the changes themselves.

## 2. Diagnosis in one page

The user's impression ("a bloated app that needs effort and knowledge") is accurate, and it has five root causes. Fixing symptoms one by one will not change the impression; the causes have to go.

1. **Everything is always visible.** The task panel shows 13 property rows for every task, including seven time-related ones (Due, Deadline, When, Evening, Reminders, Estimate, Repeat). The sidebar lists 12 or 13 top-level destinations before a single project. Every list view opens with duration filter chips. The Today view opens with an assistant advertisement. The project page shows four rows of chrome (History, Activity, List/Board, quick add, duration chips, an empty "No section 0" group) before the first task. Nothing is folded, staged or earned.
2. **The scroll model is broken.** With a task open on a 1280×800 screen there are **four nested scroll regions**: the sidebar (832 px of content in 800), the Projects list inside it (694 px of content clipped to 192 px), the page, and the panel. The panel is not sticky, so scrolling the list drags it off screen and leaves a blank area under it. That is the "content seems cut" and "multiple scrollbars" the user sees, and it is one layout decision in `Shell.tsx` and `TaskListView.tsx`.
3. **Each screen was laid out on its own.** The content column starts at 288, 384, 408, 464 or 560 px depending on the view. Page titles use four different sizes (`text-xl` ×14, `text-lg` ×9, `text-base` ×6, `text-h1` ×2). The task checkbox sits at a different x in flat views, tree views and projects. Settings have one presentation on the overview and another on a section page. The calendar has its own toolbar and its own side panel. There is no page template, so nothing lines up across views.
4. **The design system exists but the screens only half use it.** In `web/src/app`: 247 `text-xs` against 150 `text-meta`; 75 `rounded-md/lg/xl` against 46 token radii; 21 raw shadows against 4 token shadows; 175 legacy `btn-*` classes against 147 `<Button>`; 65 raw `className="input"`; 28 `text-[10px]`/`text-[11px]`; 10 `window.confirm`; 52 `kbd` badges inline in the chrome; 213 native `title=` tooltips. `web/src/ui/index.ts` is empty, so there is no single import of the primitives. The token lint only covers `web/src/ui`. Storybook has 36 stories, none for the Sidebar, Shell, TaskRow, TaskListView, BoardView, CalendarView or QuickAdd, which is where the app is actually experienced.
5. **The vocabulary is overloaded and keyboard-first copy leaks into the chrome.** Four different things are called "Activity" (sidebar feed, project disclosure, task tab, Settings → You → Activity). "Views", "Filter", "saved views" and "dashboards" overlap. Tasks have Due, Deadline, Start/When, Someday, Anytime and Evening, which are six ways to say when. Shortcut hints (`q`, `S`, `H`, `v`) are printed next to controls for everyone, "sorted by date" sits in a page title, and the shortcuts overlay lists 80 rows in one flat table, with `Shift+S` documented twice with two meanings.

The fix is a programme, not a polish pass: a shell with a fixed scroll model and one page template; progressive disclosure in the task panel and the lists; one settings pattern; a shortcut and help system built around context; and the design system enforced on the screens, with the core screens in Storybook. Section 7 sequences it into eight OpenSpec changes.

## 3. The standard to design to

These are the rules every change below is measured against. They extend `docs/design-system.md` from "how to use tokens" to "how a screen behaves".

1. **Three columns, three scrollers.** Sidebar, content, panel: each fills the viewport height and scrolls alone. Nothing else scrolls vertically. Horizontal scroll exists only in the board and the week grid.
2. **One page template.** Every view renders `PageHeader` (title, optional meta, up to two actions, an overflow menu) above a content column of a fixed width per page type: 48 rem for lists, 42 rem for settings and forms, full width for board and calendar. Titles share one size.
3. **Show what is set, offer what is not.** A property that is empty is one line in an "Add" affordance, not a row. The first screen of any object shows at most seven things.
4. **Chrome above content, never between.** Filters, layout switches, disclosures and hints live in the header or in menus. The first task is visible without scrolling on a 375×812 phone with the keyboard closed.
5. **Keyboard hints are discoverable, not printed.** Shortcuts appear in tooltips, menus and the palette, never as badges in the chrome, unless the user turned on a "show shortcut hints" preference.
6. **One row, one chip system.** All task rows come from one component with one metadata language: at most three chip styles (date tone, label chip, neutral count).
7. **One settings pattern.** A setting is a `SettingRow` inside a `SettingsSection`; sections are reached the same way everywhere; one help link per page.
8. **Tokens or nothing.** The token lint covers `web/src/app`. No raw palette, size, radius or shadow class ships in a screen.
9. **Every core screen has a story** and a visual baseline in light, dark, 375 and 1280, with the states that matter (empty, loading, long text, error, read only).
10. **Delight is quiet.** Completion, reordering and panel transitions are animated within the motion tokens and respect reduced motion; nothing bounces, nothing promotes.

## 4. Improvements, by area

Priority: **P0** blocks the "premium" impression and is cheap to fix; **P1** is the core programme; **P2** finishes it. Effort: S (hours), M (days), L (a change of its own).

### A. App shell, sidebar and scroll model

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| A1 | `Shell.tsx` wraps the whole view in one `overflow-y-auto` div, and `TaskListView` renders the panel as a static flex sibling inside it. With a task open there are four nested scrollers; the panel scrolls off with the page (`04-project-launch-detail-scrolled`). | The shell owns three fixed columns. The content column and the panel each get `min-h-0 overflow-y-auto`; the page itself never scrolls. The panel is rendered by the shell (route state `?task=`), not by each list view, so Calendar, Filter, Saved views and Dashboards stop re-implementing it. | P0 | M |
| A2 | The sidebar container scrolls and the Projects `nav` inside it scrolls too (`min-h-48 flex-1 overflow-y-auto`), clipped to 192 px with 694 px of content. Labels live inside that inner scroller and are invisible without scrolling it. The account row is cut off at 800 px height. | One scroller for the whole sidebar. Logo and primary navigation pinned at the top, account and Help pinned at the bottom, everything between scrolls as one list. Labels become a collapsible group at the same level as Projects. | P0 | S |
| A3 | 12 to 13 primary destinations (Inbox, Today, Upcoming, Anytime, Someday, Assigned to me, Day, Week, Completed, Filter, Trash, Ask, Activity) before Views and Projects. | Five by default: Inbox, Today, Upcoming, Calendar, Projects. Anytime, Someday, Assigned, Completed, Activity, Trash, Filter and Ask move into a collapsed "More" group (or are promoted by the user through a "Sidebar" preference, like Things' and Todoist's view toggles). Day and Week become one Calendar entry with the mode remembered. Counts stay only on Inbox and Today. | P1 | M |
| A4 | The top bar is 56 px of almost nothing on desktop: four icons on the right, no title. The page title then costs another 60 px inside the content. | Remove the top bar on desktop. Move search, notifications, sync and help into the sidebar footer and the `PageHeader` actions. On mobile the bar stays, holding the menu button, the page title and two actions. | P1 | M |
| A5 | "Synced · Live" is permanently visible text. | Sync status is a dot in the sidebar footer, text only on hover, on error, offline or with pending changes. | P1 | S |
| A6 | Sidebar rows mix `rounded-md`, `px-2 py-1.5`, `text-sm`, inline `style={{color}}`, a `text-[10px]` badge, a `text-base` "+" glyph and a `text-[10px] normal-case` "All" link. The section headers are buttons in one case (Labels) and plain text in another (Projects). | One `SidebarItem` primitive (icon, label, count, badge, active, depth) and one `SidebarGroup` (title, collapsible, trailing icon buttons). Both in Storybook. | P1 | M |
| A7 | Project rows truncate at 256 px minus indentation; deep trees stop indenting at level 3 with no visual sign. | Indent 12 px per level, guide lines on hover, and a tooltip with the full path. Allow the sidebar to be resized (240 to 360 px, remembered per device). | P2 | M |
| A8 | The notice bars (start view removed, rejected changes) push the content down. | Notices become toasts from the shared `Toasts` overlay. | P2 | S |

### B. Task lists and rows

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| B1 | The checkbox x position differs by view: flat date-sorted views (Today, Upcoming) have no collapse slot, tree views (Inbox, Projects) reserve one, projects add section grouping. The user reads this as random indentation. | One `TaskRow` layout with a fixed 24 px leading slot in every view; the slot shows the chevron only when there are children. Sections and date groups use the same group header. | P0 | S |
| B2 | Duration chips (Quick wins, Under 30 min, Over 1 h, Unestimated) are rendered above every list, including an Inbox with eight tasks. | Hidden by default. Available from a "Filter" action in the `PageHeader` and from the palette; once chosen, shown as one active chip with a clear button. | P0 | S |
| B3 | Inbox rows show an "Inbox" project chip on every row. | `showProject` is false in the Inbox and in a project view. | P0 | S |
| B4 | "sorted by date" is printed on the right of the Today, Upcoming and Assigned titles. | Removed. Drag is simply unavailable there; a drag attempt shows a one-line toast once. | P0 | S |
| B5 | The Today view opens with a dismissable assistant promotion banner. | No promotion in task views. The assistant is discovered in Settings → Integrations and the palette. | P0 | S |
| B6 | Row metadata uses at least six visual styles: coloured date text, hourglass + number, mono estimate chip, mono `0/3` counter, icon-only glyphs (notes, repeat, evening, comments, attachments), label pills, project dot + name, assignee chip, "not yet encrypted" warning. | A metadata language with three styles: **tone text** (date and deadline, with the icon only for the deadline), **label chip**, **neutral chip** (estimate, subtask progress, comment and attachment counts, project). Icon-only glyphs are dropped or folded into those chips; the evening and repeat marks become a small suffix on the date. Encryption state moves to a row-level badge that appears only in the shared-project case. | P1 | M |
| B7 | Rows are 44 px with 8 px padding and the second line always rendered, even when empty. Density cannot be changed. | Two lines only when there is metadata; a "Compact / Comfortable" preference like Linear and Todoist. | P2 | M |
| B8 | Group headings differ: date groups are `text-xs uppercase` with no count, section headings are `font-semibold` with count, "+" and a menu. | One `ListGroupHeader` (title, count, collapsible, trailing actions on hover). | P1 | S |
| B9 | "No section 0" and "Done 0" groups are shown in list and board because completed tasks are hidden. | Empty groups collapse to the header only in list view; "No section" is hidden when empty; a section that only has completed tasks shows "3 completed" with a reveal link. | P1 | S |
| B10 | The complete action has no reward: the row re-sorts immediately. | A 250 ms completion animation (check draws, row fades, count ticks), within `--duration-emphasis`, and a single "Undo" toast for the last completion. | P2 | M |
| B11 | Bulk selection: a checkbox appears on hover before the priority circle, shifting the row. | The checkbox replaces the priority circle while hovering or ticked, with no layout shift. | P2 | S |

### C. The task panel

This is the "paperwork" problem. `Properties.tsx` renders 13 `PropertyRow`s for every task, before subtasks, attachments and three tabs.

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| C1 | All properties are always visible: Project, Section, Parent task, Assignee, Priority, Due, Deadline, When, Evening, Reminders, Estimate, Repeat, Labels. On a phone the panel is three screens tall before the comments. | **Progressive disclosure.** The panel shows the title, the notes, then only the properties that have a value, as compact inline chips in a single wrapping row (like Linear's property bar). An "Add" button opens a menu of the remaining properties (with their shortcuts). Project is always shown as a breadcrumb; Priority and Due are always shown as chips because they are the two most used. | P1 | L |
| C2 | Seven time-related rows (Due, Deadline, When, Evening, Reminders, Estimate, Repeat) compete for the same mental slot. | One **"When" control** opened from the Due chip: a date picker with tabs or segments for Due (date, time, zone), Start (date or Someday), Deadline, and toggles for This evening and Repeat, plus the reminders list inside it. Estimate joins Priority in the "Effort" chip. The data model does not change; only the editor is unified. | P1 | L |
| C3 | The Notes editor renders as a 110 px empty box with a border for every task, even without notes. | Empty notes are a single placeholder line ("Add notes…") that expands into the editor on focus; non-empty notes render without a border, with a subtle hover. | P1 | S |
| C4 | The Assignee row in a solo project shows "You" with a "Show in Assigned to me" switch; a concept nobody asked for. | Hidden unless the project is shared. The "Assigned to me" view explains itself with an empty state. | P1 | S |
| C5 | The Parent task row is shown for every task; the parent is already shown as a breadcrumb above the title. | Parent is only the breadcrumb (clickable) and a "Move under…" item in the panel menu. | P1 | S |
| C6 | Section row appears only sometimes (project has sections), so the layout shifts between tasks. | Section is part of the Project breadcrumb ("Website launch › Backlog"), one picker. | P1 | S |
| C7 | Subtasks, Attachments ("Add file", "Add link", "or paste or drop files here") and "Created …" each render their own header and controls at all times. | Subtasks become a checklist directly under the notes with a quiet "Add subtask" line; Attachments collapse to one "Attach" action in the panel toolbar, with a list only when files exist; "Created / Completed" moves into the Activity tab. | P1 | M |
| C8 | The Comments, Activity and History tabs sit at the bottom of the same scroller; the empty state of Comments is a 180 px card with an icon. | Tabs stay, but the empty state is one line and the composer is pinned to the bottom of the panel (always reachable without scrolling). | P1 | S |
| C9 | The header has "Complete" as a bordered button, a subtasks badge, a "…" menu and a close button; no title in the header, so a scrolled panel loses its context. | Sticky header: checkbox + title (editable inline), then "…" and close. Complete is the checkbox, as in the row. | P1 | S |
| C10 | The panel is 448 px wide at every desktop width and full width only below 768 px. | 420 px at 1024, 480 px from 1440, and a "Expand" action that opens the task as a full page (`/task/:id`) for long notes and threads. | P2 | M |
| C11 | Priority is four bordered buttons with coloured text, visually the loudest element on the panel. | A single priority chip that opens a 4-option menu; the current priority colours the checkbox ring, as in the row. | P1 | S |
| C12 | The recurrence editor, reminders editor and estimate editor each have their own layout and vocabulary. | All editors are `Popover`s from the chip they belong to, with the same header, the same footer (Clear, Done) and the same keyboard behaviour. Covered by one story each. | P2 | M |

### D. Project page, sections and board

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| D1 | Above the first task: title row (Share `S`, Project ▾), "› History", "› Activity `H`", "List / Board `v`", quick add, duration chips, "No section 0" with "+". Six rows of chrome. | `PageHeader` with the title, a List/Board segmented control, and one "…" menu holding Share, History, Activity, Archive, Move, Rename. The activity and history open as a right panel (same slot as the task panel), not as inline disclosures. | P1 | M |
| D2 | Board columns are 288 px with `max-h-[calc(100dvh-14rem)]`, inside the page scroller, so the board scrolls in two directions plus the page. | The board is the content column's own scroller: columns fill the height, each column scrolls alone, the page does not. | P1 | M |
| D3 | On a phone the board's first column is "No section" at 85 vw, blank (`34-m-board`). | Hide empty "No section"; columns are 88 vw with a dot pager and snap; the active column name is in the header. | P1 | S |
| D4 | Board cards use the list row with `card` styling: the same metadata noise plus a shadow. | A `TaskCard` variant: title, up to three chips, a footer with assignee and date. | P2 | M |
| D5 | Sub-projects are listed below the tasks, after "+ Add section", as a separate section with a different heading style. | Sub-projects are a collapsible group at the top of the list (or a chip row in the header), with the same group header as sections. | P2 | S |
| D6 | The project colour is a 12 px dot; projects have no icon or emoji choice, so all projects look alike in the sidebar and headers. | Projects get an icon (from the Lucide set) in addition to the colour; the header shows it large. | P2 | M |

### E. Calendar (Day and Week)

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| E1 | The calendar has its own toolbar (title left, arrows, Today, Day/Week, "Hide task list") instead of the page header, no page padding, and a 256 px "Tasks to plan" side panel with a native `<select>`. | Uses `PageHeader` (title = range, actions = Today, arrows, Day/Week segmented). The planning list becomes the right panel (same slot as the task panel) with the design-system Combobox as its source picker. | P1 | M |
| E2 | The all-day lane shows the "2h 50m / 8h +5?" capacity string in a tiny mono font with no explanation. | A capacity bar with a tooltip ("2 h 50 of 8 h planned · 5 tasks without estimate"). | P2 | S |
| E3 | Timed blocks use a dashed border for "due time without estimate" and a solid one for planned blocks; nothing says so. | A legend in the header menu and a tooltip on hover; dashed blocks get a "Set estimate" hover action. | P2 | S |
| E4 | On mobile the week view is unusable (seven 80 px columns). | Below 640 px the week is a vertical agenda; the grid is desktop only. | P2 | M |

### F. Capture: quick add, voice and natural language

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| F1 | The quick add is good (chips, preview). The `q` badge on its right and the "Help" link under the chips are chrome. | Badge goes into the placeholder's tooltip; the Help link appears only on the first three uses per device. | P1 | S |
| F2 | The quick add sits in the content column of every list; on Completed it disappears, on read-only projects it becomes a disabled input with a note. | Keep it in the lists, but in read-only projects show nothing (the header already says "Viewer"). On mobile, a floating "+" button opens it as a bottom sheet, which is the pattern every competitor uses. | P1 | M |
| F3 | Voice capture needs a Settings switch before its microphone button appears. | The microphone button is always in the quick add when the browser supports speech; first use asks. | P2 | S |

### G. Settings

14 sections in 4 groups; the overview is a card list, a section page is a left nav plus stacked cards. The user's "inconsistent views" is exactly that switch.

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| G1 | Two presentations (overview list vs section page with side nav). On desktop, three navigation columns are visible at once: app sidebar, settings nav, content. | One pattern at every width: from 1024 px a two-column settings page where the left column is the grouped section list (always visible, no separate overview) and the first section opens by default; below 1024 px the list is the overview and a section is a page with a back link. The `/settings` overview as a separate screen disappears. | P1 | M |
| G2 | Hard to find things: "Appearance" is under Preferences but the description omits it; "Reminders" push setup is under Notifications; "Email to task" under Capture; "Archived projects" under Projects; MCP under AI; "Activity" under You is the audit log. | Re-cut into 9 sections: **Account** (profile, session, password, two-factor, passkeys, linked accounts, encryption), **Appearance** (mode, theme, density, sidebar), **General** (start view, date and time, week start, calendar, keyboard and Vim, language), **Notifications** (push, reminders defaults), **Capture** (quick add, voice, extension, email), **Integrations** (CalDAV, webhooks, API tokens, MCP, assistant), **Data** (export, import, sync, trash retention, archived projects), **People** (users, invitations, members, access policies, SSO; admins only), **Server** (backups, attachments quota, audit log; owner only). | P1 | M |
| G3 | No settings search; the palette indexes sections but not individual settings. | A search field at the top of the settings list that filters sections and `SettingRow`s by label and description; the palette gets the same index. | P1 | M |
| G4 | Every card has its own "Help" link in the corner (nine `HelpLink`s in Settings alone). | One Help link per page in the `PageHeader`; the help panel opens at the right anchor. | P1 | S |
| G5 | Cards differ in shape: some have a primary button in the header (Webhooks), some in the body (Two-factor), some a status badge, some a toggle row, some a keyboard hint paragraph (Users). | `SettingsSection` gets a fixed anatomy: title, one-sentence description, rows. Primary actions are the last row's control. Keyboard hints move to tooltips. Status is always a `Badge` beside the row label. | P1 | M |
| G6 | `HistoryPanel`, `InviteLinksSection`, `RestoreSection` and `Sections` build their own panels. Native `<select>`s (start view, calendar) sit next to custom segmented controls. | Everything through `SettingsSection` and `SettingRow`; selects through the `Select` primitive, styled like the inputs. | P2 | M |
| G7 | The demo note replaces whole sections with a paragraph. | Sections stay visible with disabled controls and one banner at the top of the page. | P2 | S |

### H. Keyboard shortcuts and the command palette

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| H1 | The `?` overlay renders all 80 `SHORTCUTS` in one flat table in a 448 px dialog: two screens on desktop, five on a phone. | A two-pane cheat sheet: the current context first (the list you are in), then "Everywhere" and "Go to", grouped by the `section` field that already exists, two columns from 768 px, with a search field. The dialog is `size="lg"` and capped at 80 vh with its own scroller. | P0 | M |
| H2 | Conflicts and duplicates in the table: `Shift+S` is "Share the current project" and "Skip the current occurrence"; `s` is "Schedule", "Save the query" and `g s`; `.` appears twice; `a` twice. 19 separate global `keydown` listeners decide who wins. | One shortcut registry with scopes (global, view, list, panel, editor) and a single dispatcher; the overlay and `docs/keyboard.md` render from it, so a conflict fails a unit test. Resolve: Share = `Shift+S` in the project header only; Skip occurrence moves to the task menu and `Shift+K`. | P1 | L |
| H3 | 52 `kbd` badges are printed in the chrome (quick add, Share, Activity, List/Board, Filter view, Trash subtitle, prompts). | Badges removed from the chrome; shortcuts live in tooltips (`Tooltip` primitive, see J6), menu items and the palette. A "Show shortcut hints" preference restores them for keyboard-first users. | P1 | S |
| H4 | The palette lists commands by prefix ("Open Settings: Account" ×14) and shows no recent items or sections. | Sections (Recent, Tasks, Navigate, Commands, Settings), recents from the pick history table, and the shortcut rendered on the right of each row. | P2 | M |

### I. Help and onboarding

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| I1 | `/help` is a grid of 15+ guide cards under four headings, each guide a long page (the whole bundle is 540 KB of JavaScript). The user has to know which guide holds the answer. | Help opens on **search** and **"What do you want to do?"** (eight task-shaped entries: add a task with a date, repeat a task, share a project, sync a calendar, import, install, use the keyboard, run your own server). Guides are a secondary list. Pages are split per task, under 600 words each, with a screenshot first. | P1 | M |
| I2 | The contextual `HelpPanel` exists but is reached from nine scattered "Help" links; the main screens (lists, panel, board) have none. | Every `PageHeader` has one Help action that opens the panel at the screen's anchor; the task panel's menu has "Help with this panel". | P1 | S |
| I3 | There is no first-run experience: a new owner lands on an empty Inbox whose empty state says "Press q". | A first-run flow of three steps inside the app (add your first task, choose light or dark, install or skip), followed by a sample project the user can delete. The empty states stop assuming the keyboard (keyboard hint in a secondary line only on devices with a fine pointer). | P2 | M |
| I4 | Empty states mix a card with an icon (comments, labels, webhooks) and a plain grey sentence (lists, trash). | One `EmptyState` everywhere: icon, one sentence, one action. | P1 | S |

### J. Visual language and design-system compliance

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| J1 | Token lint stops at `web/src/ui`; the screens carry 247 `text-xs`, 75 raw radii, 21 raw shadows, 28 pixel font sizes. | Extend `lint.test.ts` to `web/src/app` with a shrinking allow-list per file (the mechanism already exists as `REDESIGN_ALLOW_LIST`). Migrate screen by screen inside the changes below. Target: zero raw classes. | P1 | M |
| J2 | Four title sizes and five content-column offsets. | `PageHeader` + `PageBody` primitives; one `text-h1` for page titles, `text-h2` for panel titles, `text-h3` for cards. A story shows the three page types side by side. | P1 | M |
| J3 | 175 legacy `btn-*` classes next to 147 `<Button>`; 65 raw `.input`; `window.confirm` in 10 places. | Finish the migration started in `ui-primitives`: every button is `<Button>`/`<IconButton>`, every field is `<Field>` + `<Input>`, every confirmation is `ConfirmDialog`. Remove the legacy classes from `index.css` when the count reaches zero. | P1 | M |
| J4 | `web/src/ui/index.ts` is `export {}`; screens import from 20 paths. | A real barrel; an ESLint rule (or a unit test) that forbids importing `../ui/*` files directly from `app/`. | P2 | S |
| J5 | Cards in Settings have `shadow-1 rounded-card`; list rows have `rounded-md`; dialogs `rounded-xl shadow-xl`; the board `rounded-lg shadow-sm`. | Three surfaces only: row (`rounded-control`, no shadow), card (`rounded-card`, `shadow-1`), overlay (`rounded-card`, `shadow-3`). | P1 | S |
| J6 | 213 native `title=` tooltips: inconsistent, delayed, invisible on touch and to keyboard users. | A `Tooltip` primitive (hover and focus, 400 ms delay, shortcut slot, respects touch) used by `IconButton` by default; `title=` is linted out of `web/src/app`. | P1 | M |
| J7 | Dark mode is solid but the panel's input borders (`border-input` at `#64748b`) and the priority buttons glow more than in light; the board column background equals the canvas, so columns disappear in dark. | Review the dark pairs for the three surfaces; columns use `bg-sunken` with a border in dark; verify with the contrast test. | P2 | S |
| J8 | Project and label colours are 12 free hues mapped at render time; the accent theme can equal a project colour (Emerald accent and green projects). | Keep the palette, but the accent theme excludes the hue used by the active selection colour, and selection uses `bg-accent-soft` only on the active row. | P2 | S |
| J9 | Typography: body 15 px is fine, but secondary text is 11 to 13 px in a dozen variants, and mono chips (`font-mono text-[11px]`) look like code. | Secondary text is `text-meta` only; counts and estimates use tabular figures (`tnum` is already in the subset), not mono. | P1 | S |
| J10 | Icons are used at `xs`, 10, 14, `md` and default sizes in the same row. | Two icon sizes in content (16 in rows, 20 in headers), one in chips (12). | P2 | S |

### K. Mobile

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| K1 | Navigation is a drawer behind a hamburger; the primary views are two taps away. | A bottom tab bar below 768 px: Today, Inbox, Upcoming, Search, More (More opens the drawer). The bar hides while the task panel or a sheet is open. | P1 | M |
| K2 | Quick add is an inline input at the top of each list; with the keyboard open the list is hidden. | Floating "+" button opening a bottom sheet (F2); the inline input stays on desktop. | P1 | M |
| K3 | The task panel is a full-screen page three screens tall (C1 fixes the length). Its header has "Complete" as a wide button. | Full-screen sheet with the sticky header from C9 and the composer pinned (C8). Swipe down or back closes it. | P1 | S |
| K4 | Board (D3) and week (E4). | As above. | P1 | M |
| K5 | Settings sections on a phone are fine; the theme grid is 2 columns of 100 px cards for eight themes, one screen tall. | Theme picker as a horizontal row of swatches. | P2 | S |
| K6 | Touch targets: the sidebar collapse chevron is 16×20 px; row glyph chips are not tappable but look like it. | 44 px targets for every control (the row's leading slot becomes the tap target for collapse); chips that are not actions do not look like buttons. | P1 | S |

### L. Naming and information architecture

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| L1 | "Activity" names four things. | Sidebar feed → **Updates**; project disclosure → removed (D1), reachable as **Project activity** in the menu; task tab → **Activity** (keep); Settings → **Audit log** under Server, and the personal sign-in list → **Sessions** under Account. | P1 | S |
| L2 | "Views" (page), "Filter" (page), saved views, dashboards and "pinned" overlap. | One **Filters** concept: the Filter page is where a query is written; saving it makes a **Saved filter** (pinned or not); a dashboard is a **Board of filters**, created from the same page. The sidebar group is "Filters". | P1 | M |
| L3 | Six ways to say when (Due, Deadline, When, Start, Someday, Anytime, Evening). | Keep the fields, fix the words: **Do on** (due, with time), **Start** (date or Someday), **Deadline** (hard date), **Evening** (a flag inside Do on). "Anytime" stays as a view name only. Help and the panel use the same words. | P1 | S |
| L4 | "Assigned to me" as a top-level view in a solo install. | Visible only when at least one shared project exists (same rule the Updates entry already uses). | P1 | S |
| L5 | Copy addresses the keyboard first ("Press q", "Select a task and press L"). | Copy names the action first and the key second, only on fine-pointer devices. | P2 | S |

### M. Motion, feedback and states

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| M1 | Panel open and close are instant on desktop (slide only on mobile); lists re-sort with no transition. | Panel slides 250 ms with `ease-calm`; list reorders use FLIP transitions; both off under reduced motion. | P2 | M |
| M2 | Loading states are "Loading…" text in three places and nothing elsewhere. | Skeleton rows for lists and the panel (one `Skeleton` primitive); never a spinner for local data. | P2 | S |
| M3 | Confirmations and undo differ: bulk actions have an Undo toast, single delete goes straight to Trash with no toast, completion has none. | Every destructive or hard-to-reverse action produces the same Undo toast (5 s), from the shared store. | P1 | S |
| M4 | Drag and drop has a 2 px line indicator and a ring; nothing lifts. | The dragged row lifts with `shadow-2` and a slight scale; the drop line gains a dot at its start, as in Things and Notion. | P2 | S |

### N. Accessibility (keep what is good, fix what regressed)

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| N1 | Nested scrollers trap keyboard scrolling (A1, A2). | Fixed by the shell change; add a Playwright check that counts vertical scrollers per screen (≤ 3). | P0 | S |
| N2 | Row chips carry `aria-label`s that read as sentences ("Deadline 19 October 2026, 4d"), so a row is announced in 30 words. | Rows announce title, date, priority; the rest is in the panel. | P2 | S |
| N3 | The sidebar's tree uses `role="tree"` but the collapse buttons are `tabIndex=-1`, so Left/Right are the only way to collapse. | Keep the arrow keys, add the chevron to the tab order on touch devices only (K6). | P2 | S |
| N4 | Native `title` tooltips are invisible to keyboard users (J6). | Covered by J6. | P1 | — |
| N5 | Focus rings: tokens exist, but several custom buttons (priority, duration chips, theme cards) draw their own borders on focus. | One focus style via `focus-visible:ring-focus`, linted. | P1 | S |

### O. Storybook and process (so this does not happen again)

| Id | Problem (evidence) | Target | Priority | Effort |
|---|---|---|---|---|
| O1 | No stories for Sidebar, Shell, TaskRow, TaskListView, BoardView, CalendarView, QuickAdd, PageHeader. | Stories with fixture data for each, in light, dark, 375 and 1280, with visual baselines. The "UI check" job already runs them. | P1 | M |
| O2 | Screens have no budget: a feature adds a row, a chip, a banner. | Add to `openspec/config.yaml` a **UI budget** every change must state: rows of chrome above the first item (≤ 2), visible properties on a task by default (≤ 7), sidebar primary items (≤ 6), scrollers per screen (≤ 3), new shortcuts (registered, no conflicts). A test enforces the measurable ones. | P1 | S |
| O3 | Design decisions are spread across seven archived changes and `design-system.md`. | A single **Interface guide** page (patterns, page template, panel anatomy, settings anatomy, metadata language, copy rules) next to the design system, kept by the same lint and stories. | P1 | S |
| O4 | Visual review happens on code, not on screens. | Every change touching `web/src/app` attaches before/after screenshots from the seeded fixture (a `make screens` target using the script in this audit's method) to its pull request. | P2 | S |

## 5. What stays

The audit also found a lot worth keeping, and the changes above should protect it:

- The token system, contrast tests and both themes are solid; dark mode is already better than most competitors.
- The quick add with natural-language chips and the live preview is a differentiator.
- The combobox picker, the overlay stack, the dialog that scrolls the overlay (not the card), and `PropertyRow`'s read/edit behaviour are good primitives to build the new panel on.
- The settings section cards themselves (title, sentence, rows, switch on the right) read well; the problem is how many there are and how they are reached.
- Offline, sync status, undo for bulk actions, and the command palette are the right foundations for "it just works".

## 6. Targets

| Measure | Today | Target |
|---|---|---|
| Vertical scroll regions with a task open (1280×800) | 4 | 3 (sidebar, list, panel) |
| Rows of chrome above the first task in a project | 6 | 2 (header, quick add) |
| Properties visible by default on a task | 13 | ≤ 7 (title, notes, project, do on, priority, labels, subtasks) |
| Sidebar primary items before Projects | 12 to 13 | 5 |
| Task panel height on 375×812 for an empty task | ~3 screens | < 1.5 screens |
| Distinct content-column left edges at 1280 | 5 | 2 (lists, settings) plus full-bleed |
| Page title sizes | 4 | 1 |
| Shortcuts overlay | 80 flat rows | grouped by context, searchable, fits 80 vh |
| Things named "Activity" | 4 | 1 |
| Settings sections | 14 | 9 |
| Raw `text-xs` / raw radii / raw shadows in `web/src/app` | 247 / 75 / 21 | 0 / 0 / 0 |
| Legacy `btn-*` / `.input` / `window.confirm` | 175 / 65 / 10 | 0 / 0 / 0 |
| `kbd` badges in chrome / native `title=` | 52 / 213 | 0 / 0 |
| Core screens with Storybook stories and baselines | 0 of 8 | 8 of 8 |

## 7. Proposed sequence of OpenSpec changes

Each is one `/opsx:propose`. The first two are small and remove the pain the user feels today; the rest are the redesign proper. Dependencies are noted.

1. **`shell-scroll-model`** (P0, A1, A2, B1 to B5, H1, N1): three fixed columns, one sidebar scroller, the panel owned by the shell, the list row's fixed leading slot, duration chips behind a filter action, no promo banner, no "sorted by date", grouped shortcuts overlay. One week of work, visible every minute afterwards.
2. **`interface-guide-and-page-template`** (A4 to A6, B8, J1, J2, J5, J6, J9, O2, O3): `PageHeader`, `PageBody`, `Tooltip`, `SidebarItem`, `SidebarGroup`, the lint extended to `web/src/app`, the UI budget in `openspec/config.yaml`, the Interface guide page. Every later change builds on these.
3. **`task-panel-v2`** (C1 to C12, L3, M3): progressive disclosure, the unified When control, the sticky header, the pinned composer, the Undo toast for single actions. Depends on 2.
4. **`navigation-and-naming`** (A3, A7, L1, L2, L4, D1, D5, E1, I2): the five-item sidebar with "More", Calendar as one entry, the project header through `PageHeader`, Filters vocabulary, Activity renamed, Help in every header. Depends on 2.
5. **`settings-v3`** (G1 to G7, I4): one presentation, nine sections, settings search, one Help per page, `SettingsSection` anatomy. Depends on 2.
6. **`shortcut-registry`** (H2 to H4, L5): the scoped registry and dispatcher, conflicts as test failures, hints out of the chrome, the palette with sections and recents. Can run in parallel with 3 to 5.
7. **`mobile-patterns`** (K1 to K6, D3, E4, F2): bottom tabs, floating add with a bottom sheet, board pager, agenda week, 44 px targets. Depends on 1 and 2.
8. **`rows-cards-and-motion`** (B6, B7, B9 to B11, D4, D6, J7, J8, J10, M1, M2, M4, O1, O4): the metadata language, density, the task card, project icons, completion and drag motion, skeletons, and the core-screen stories with baselines. Depends on 2 and 3.

Phases 1 and 2 are the foundation and should land before any new feature change touches `web/src/app`; the 18 changes currently open under `openspec/changes/` will otherwise each add their own rows and chips on top of the old model.
