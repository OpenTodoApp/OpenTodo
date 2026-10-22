---
title: Interface guide
summary: How a screen of the web app is put together: the page template, the three columns, the task panel, settings, rows and chips, copy, and the interface budget every change stays inside.
audience: developer
section: Internals
specs: [design-system, web-app, app-shell, task-list-presentation, keyboard-shortcuts, first-run]
screens: []
order: 31
---
# Interface guide

The [design system](design-system.md) says which tokens and building blocks exist. This page says how a screen uses them, so that every view feels like the same app. The rules come from the OpenSpec capabilities `app-shell`, `task-list-presentation`, `keyboard-shortcuts`, `settings-navigation` and `design-system`; where a rule is enforced by a test, the test is named.

## Ten rules

1. **Three columns, three scrollers.** Sidebar, content, panel: each fills the viewport height and scrolls alone. Nothing else scrolls vertically; the board's columns and the calendar grid are the only designated regions (`data-scroll-y`). Enforced by the layout check and `budget.test.tsx`.
2. **One page template.** Every view renders `PageHeader` above `PageBody`. One title size, at most two visible actions, an overflow menu, one Help action. Enforced by `pageTemplate.test.ts`.
3. **Show what is set, offer what is not.** An empty property is an entry in an "Add" menu, not a row. A task shows at most seven things by default.
4. **Chrome above content, never between.** Filters, layout switches, disclosures and hints live in the page header or its menus. Enforced by `budget.test.tsx`.
5. **Keyboard hints are discoverable, not printed.** Shortcuts appear in tooltips, menus, the palette, the cheat sheet and the sequence spotlight (the card that waits after a hesitated `g`), never as badges in the chrome, unless the "Show shortcut hints" preference is on. Keys are drawn with `Keys` from `web/src/app/shortcuts/Kbd.tsx`: one keycap per chord, "then" and "or" between them, and a keycap never wraps.
6. **One row, one chip system.** All task rows come from `TaskRow`; metadata uses three styles (tone text, label chip, neutral chip).
7. **One settings pattern.** A setting is a `SettingRow` inside a `SettingsSection`; one Help action per page.
8. **Tokens or nothing.** No raw palette, size, radius or shadow class in a screen; no legacy `btn-*`, `.input` or `.kbd` class; no native `title` attribute. Enforced by `lint.test.ts` (the not-yet lists in `notYetMigrated.ts` only shrink).
9. **Every core screen has a story** with a visual baseline in light, dark, 375 and 1280 px. A screen is core when the screen inventory (`scripts/ux-audit/screens.json`) marks it as used daily or weekly; `make ui-lint` runs the story-coverage script, which fails naming a core screen without its story.
10. **Delight is quiet.** Transitions stay within the motion tokens and respect reduced motion; nothing bounces, nothing promotes. The one considered moment is the completion sequence (motion-v2): the op is written at once and the list keeps a *departing* row for 400 ms while the check pops, the strike draws and the row folds away.

## The page template

```tsx
<PageBody width="list">
  <PageHeader title="Today" meta={date} help="today"
    actions={<Button variant="ghost" size="sm" icon="filter">Filter</Button>}
    overflow={<><MenuItem … /><MenuSeparator /><MenuItem … /></>} />
  …
</PageBody>
```

| Width | Used by | Column |
| --- | --- | --- |
| `list` | Inbox, Today, Upcoming, labels, filters, Trash, Updates, Help | 48 rem |
| `form` | Settings pages, Import, Ask | 42 rem |
| `wide` | a project's list (with or without field columns) | 72 rem |
| `full` | Board, timeline, Day, Week, Month and Plan | the whole frame |

**The lead line.** The title is set at the `display` step on its own line; the page's `meta` (Today's date and totals, a project's members, a label's count, a read-only note) is a muted line under it at the metadata size (`data-page-lead`). It is inside the one header element, so the interface budget's "rows of chrome" (a count of elements) is unchanged. Below 768 px the shell's bar shows it as its subtitle.

**Two page frames** (`data-page-frame`). A *standalone* page, one without a layout switch (Inbox, Today, Upcoming, a label, Filter, Trash, Updates, Settings, Import, Ask, Help, the review screens), has a frame as wide as its content plus the side padding: the title and the first row share one left edge. A *layout* page (a project, a saved view with a board or timeline, the calendars) keeps one frame of at most 80 rem; the header spans it and the content starts at its left edge, so a project's title and actions never move between list, board and timeline. Content wider than the frame scrolls sideways inside it. Both frames start at the content column's left edge (list-stays-still), so every page shares one left edge and the docked panel opens into the space on the right. `PageBody` picks the frame from its width (`full` is a layout page) or `frame`; the task lists mark theirs in `TaskListView`. The CSS is one unlayered rule in `index.css`.

| Window (sidebar 16 rem) | Content column | Panel | Standalone, panel closed | Standalone, panel open | Layout frame, closed / open |
| --- | --- | --- | --- | --- | --- |
| 1024 px | 48 rem | 26 rem | fills (list 44 rem) | fills (22 rem) | 48 / 22 rem |
| 1280 px | 64 rem | 26 rem | 52 rem, 12 rem free on the right | fills (38 rem) | 64 / 38 rem |
| 1440 px | 74 rem | 30 rem | 52 rem, 22 rem free on the right | fills (44 rem) | 74 / 44 rem |
| 1920 px | 104 rem | 30 rem | 52 rem, 52 rem free on the right | 52 rem, 22 rem free on the right | 80 / 74 rem |

Opening and closing the panel moves no row and not the title: the frame's left edge never changes, and a frame wider than the narrowed column gives up width on its right. Nothing slides. The panel's width is one custom property, `--panel-w` (26 rem, 30 rem from 1440 px), read by both docked panels. Enforced by `pageTemplate.test.ts`, `pageRhythm.test.tsx` and the frame step of `make e2e`.

The header is sticky inside the content column. A string title is truncated; pass a node for an inline rename field. `back` adds a back action for nested pages and phones. `children` is a second row (a segmented control, tabs) and counts against the budget. Below 768 px the shell's bar shows the title and the first two actions, so a view declares its header once.

## The three columns

- **Sidebar**: the header row and primary destinations pinned at the top, one footer row pinned at the bottom, and only the groups between them scroll (`data-sidebar-scroll`). The header row is `SidebarHeader`: a `left` slot (the mark and the wordmark; a workspace switcher later) and search; the rail shows the mark alone. Items come from `SidebarItem`, groups from `SidebarGroup`. Tones: a row is quiet (`text-faint`) at rest, default on hover and focus, and strong on `bg-accent-soft` with an accent icon when active (`data-tone`). A group's controls (All, Find, New) use `.ui-reveal`: hidden by opacity until the header has the pointer or focus, always shown on a coarse pointer, never removed from the Tab order; the header's name carries its count ("Projects, 12 items"). On a fine pointer from 768 px More is a group heading that opens a menu, never a row with an icon. The column is `--ot-sidebar` (the canvas with 3 % of the accent, 4 % in dark) with a fine pointer from 768 px and the surface in the drawer; sticky group headers read the same `--sidebar-bg`. The footer row is the account control (avatar and name, opening a menu with Settings, Help, Keyboard shortcuts and Sign out), then the assistant, the bell, the sync dot and the collapse control; while time is tracked a pill (time, title, Stop) takes the name's place in the same row. Counts: only Inbox and Today show theirs at rest; a project row uses `countMode="hover"` (shown on hover or focus, always on a coarse pointer), filter and label rows `countMode="hidden"`, and every count is in the row's name through `countLabel`. State is one accent dot (`StatusDot`) on the entry it is about (the review-due dot on Review, the unread count on Updates), with its meaning in the tooltip and the name, never a filled badge and never on More; the danger colour is for errors.
- **Content**: the page template. The shell gives it the scroller; a view never adds one of its own.
- **Panel**: owned by the shell (`PanelHost`). Views open a task with `openTaskPanel(id)` (or `setPanelTaskId`) from `app/panel.ts`; the address carries `?task=<id>`. Other occupants (project activity, the planning list) use `openPanel(key, render)`.

## On a phone

Below 768 px (OpenSpec change `phone-v2`):

- **Loading moves nothing**: a screen draws what depends on local data once it is read, with the `Skeleton` until then, never an empty state or empty groups first (lists and Statistics through `useListReady` and their own `ready`; the Plan, Projects, Updates, the sidebar and the Display screen through `useLiveTasks`, `useProjectsLoaded`, `useTasksByIdRead` and `useSidebarRowsLoaded`). A settings card that asks the server calls `useSettingsPending(waiting)`; the section's `SettingsPendingGate` keeps its cards invisible until each has answered once, 600 ms at most, then never hides them again (`app/settingsPending.tsx`). The interface audit's M12 checks it.
- **Bar**: the shell's `PhoneBar` takes the page title, a subtitle (the board's column, the Inbox's planned count) and two slots. A list passes its actions with `PageHeader barActions`: Process the Inbox or Ask first, then the duration filter (`usePhoneListActions` in `task-list/ListChrome.tsx`); Select tasks, Display mode, a project's Layout, Share and Add a note are overflow items (`PhoneMenuItems`, `phoneGroups`). Nothing sits between the bar and the quick add.
- **Bottom**: the tab bar (Today, Inbox, Upcoming, Search, More) and the add button. While the list scrolls down the bar drops to 40 px of icons and the button slides out; any scroll up, the end of the list or 600 ms of quiet bring both back (`usePhoneChrome`); reduced motion keeps them still. The content column reserves the button's footprint (`--add-room`) and the toast sits above both (`--toast-lift`).
- **Rows**: swipe right completes (reopens in Completed), swipe left opens the Schedule sheet (`rowSwipe.ts`, `task-list/RowSwipe.tsx`): a 12 px direction lock, the action named at 64 px, fired at 96 px or on a flick, a return under 32 px. No swipe on a fine pointer, a read-only row, a card, the inline editor or while anything is ticked. Complete and Schedule… start the touch row menu. A long press ticks the row and shows every checkbox (`onHold` in `lib/dnd.ts`); moving on drags the selection.
- **Sheets**: the task panel is a bottom sheet (`useTaskSheet`): a handle, 90 dvh at most, the scrim behind, Close in place of Back; a drag down on the handle or header closes it, on the body only from the top. Menus and pickers below 640 px are sheets with the same cap and drag.
- **Drawer**: More opens the sidebar as a 20 rem drawer (85 vw at most) of 48 px rows, without the destinations the tab bar holds.
- **Budget**: two rows of chrome above the first task (the bar and the quick add); the bottom chrome never covers a row; every touch control is at least 48 px. The layout check also runs the phone screens at 360 px in German and French.

## The task panel

Sticky header (checkbox, title wrapping to two lines, menu, close); notes as one placeholder line until focused, clamped to about eight lines at rest; four facet lines built by `facetsOf` in `web/src/lib/facets.ts` (Where, When, How always; Who when set) whose parts open `FacetEditor` popovers with Clear and Done, the When parts on one segment of the When popover; an Add menu grouped by facet; subtasks as a checklist; Comments, Activity, History and Time tabs with the composer resting as one line at the bottom. Parts use the row's words; no clear buttons between values. The words are **Do on**, **Start**, **Deadline**, **Evening**.

## Settings

Nine sections (Account, Appearance, General, Notifications, Capture, Integrations, Data, People, Server) in one layout: the section list beside the content from 1024 px, list-then-page below. A section is a card with a title, one line and rows; it has no header action. Its line may end with **Learn more** (`SettingsSection` `learnMore`, a Help screen id), which opens the card's guide section beside the page: the only way a card reaches Help (`settingsAnatomy.test.tsx`). A row shows state as a badge beside its label; a primary action is the control of the last row. Sections come in two tiers (`SettingsSection` `tier`): the one card a page is about is `primary` (the card surface), every other section is `flat` (`ui-section-flat`: no fill, a hairline above), with the same anatomy; at most one primary per page (`settingsAnatomy.test.tsx`). The English text of every card, row, option and notice is one table, `web/src/lib/settingsCopy.ts`, keyed by the card's heading id; panels spread `cardCopy()` and `rowCopy()` into the primitives and never pass a description of their own.

## Rows and chips

- A row: a 24 px leading slot (chevron only with children), the checkbox, the time column when the list has one (`data-row-time`, width `--row-time-w`: the due time, else the deadline countdown), the title, a metadata line only when there is metadata, and a trailing group (`data-row-trailing`: the project from 640 px, the counts `data-row-counts`, the origin) in `text-faint` that turns `text-muted` on hover or focus within the row. It is never hidden and never a control.
- One row language (rows-v2; `row_detail` is retired): the line is one run of muted `ToneText` separated by CSS middle dots (`[data-row-meta]`), the date on the due ladder (`ladderTone` in `rowTone.ts`: after tomorrow muted, tomorrow default, today accent timed or not, an earlier day danger; the deadline countdown keeps its own steps), repeat as a `repeat` icon with its word, the priority ring coloured for P1 and P2 only. `LabelChips` (two chips, then "+n") are the only pills of a row. On a fine pointer from 768 px, `RowActionCluster` (Schedule, Priority, More) takes the trailing group's place on hover or focus within. Board cards (`shape="card"`) have no column: the time leads their line. No icon-only glyphs.
- A row leaves out only what its view or heading states: `ListRow.implied` from `listGroups()` (the day a heading names, This Evening, Someday), `omitLabel` in a label's view and `showProject`. A new fact a heading can imply is one more field there; a new count is one more entry in `rowCounts()`.
- Motion on a row (motion-v2): `data-departing` marks the last picture of a completed task while it folds away (no `data-task-id`, `aria-hidden`, `inert`; counts, the cursor and drops never see it), `data-rolled` a repeating task rolling to its next date, `data-restored` a row Undo brought back. Local list changes go through `withListTransition` in `web/src/app/motion.ts` (view transitions, at most 40 rows, never for sync); overlays exit on a copy (`playExit` in `web/src/ui/overlay/exit.ts`).
- Counts use tabular figures in the interface face, never a monospace face.
- Group headers are labels (`ListGroupHeader`): metadata size, semibold, muted; `kind="generated"` (a date, Earlier, Today, Blocked, Later, Completed, No section) is uppercase with wide tracking, `kind="named"` (a section, a project) keeps the user's case. CSS uppercase keeps the DOM text for assistive technology. No header is red; how late a task is shows on its row. `actionsAlwaysVisible` is for a group whose actions are its purpose (Today's **Earlier**: Move all to today, Reschedule…), and wraps them under the label on a phone.
- Words: tasks planned for an earlier day are **Earlier** (a group), "n from earlier" (a count), "still open from earlier" (a sentence), never "overdue"; Statistics' "completed late" and "slipped" and the countdown's "nd over" are measurements and keep their words. `i18n.test.ts` checks the catalogs.
- Calendar blocks, Month and Plan rows and timeline bars are `ui-block` in the project hue (dashed edge without an estimate, dimmed before today, danger edge when late); events from other calendars are `ui-block--event`, neutral with a calendar dot. No chrome row was added for them.
- Icon sizes: 16 px in rows, 20 px in headers, 12 px in chips.
- Empty views: one sentence, one primary action, one optional link; the key in the tooltip. Every task view renders them through `EmptyState` in `web/src/ui` with data (`title`, `action: { label, onClick, shortcut }`, `secondary`), never nodes, so a view cannot add an icon, a second line or a second button. `compact` is for an empty day inside a list of days. The `icon`, `body` and `control` slots are kept for the settings panels only, until those move to the same rule.

## Copy

Name the action first and the key second, and the key only on fine-pointer devices. Say what happens ("Moved to Home · Undo"), not what the system did. One idea per sentence. In Settings a title or label has at most 4 words, a card's, row's or notice's line at most 90 characters in English (a translation at most 120), and an option of a choice card at most 60; anything longer goes to the guide section the card's Learn more opens, and a safety warning keeps a one-line pointer on the card. `web/src/lib/settingsCopy.test.ts` checks all of it; confirmation dialogs keep their full consequence. The product words are listed in `docs/views.md` and `docs/tasks-and-projects.md`; four different things are never called the same name.

## The interface budget

Every change that touches a screen states in its design how it stays inside these limits (an OpenSpec rule in `openspec/config.yaml`). The measurable ones are tests.

| Limit | Value | Test |
| --- | --- | --- |
| Vertical scroll regions per screen | 3 | `budget.test.tsx`, layout check, audit (M5) |
| Rows of chrome above a list's first item | 2 elements (the header, with its lead line inside, and quick add); nothing under the quick add, first-run guidance only as an overlay | `budget.test.tsx`, audit (M2) |
| Task properties visible by default | 7 | `budget.test.tsx` (with the panel redesign), audit (M3: a row's metadata line) |
| Primary sidebar destinations | 6 | `budget.test.tsx` (with the navigation change), audit (M4) |
| New shortcuts | registered, no conflict | the shortcut registry test |

The limits live in `web/src/app/budget.json`, read by the tests and by the interface audit, which measures them on the built app at three widths ([Design system](design-system.md#the-interface-audit)).

When a feature needs more than the budget allows, the answer is a menu, a chip, a panel occupant or a preference, not another row. Guidance that has to interrupt (the start guide) is a `Dialog`, with `placement="sheet"` so a phone keeps the page visible above it; the demo banner is one line above the shell at every width.
