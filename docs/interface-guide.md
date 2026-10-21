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
9. **Every core screen has a story** with a visual baseline in light, dark, 375 and 1280 px.
10. **Delight is quiet.** Transitions stay within the motion tokens and respect reduced motion; nothing bounces, nothing promotes.

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
| `list` | Inbox, Today, Upcoming, projects, labels, filters, Trash, Updates, Help | 48 rem |
| `form` | Settings pages, Import, Ask | 42 rem |
| `wide` | a project's list with field columns | 72 rem |
| `full` | Board, timeline, Day, Week, Month and Plan | the whole frame |

**One page frame.** Every page sits in the same frame: centred in the content column, at most 80 rem wide, with the same side padding (`PageBody`, or `PAGE_FRAME` for the task lists). The header spans the whole frame; the content takes its width from the table and starts at the frame's left edge, so the title and the last header action never move when you go from a list to a board, a timeline or Settings. Content wider than the frame (a board with many columns, a long timeline) scrolls sideways inside it. Enforced by `pageTemplate.test.ts` and the frame step of `make e2e`.

The header is sticky inside the content column. A string title is truncated; pass a node for an inline rename field. `back` adds a back action for nested pages and phones. `children` is a second row (a segmented control, tabs) and counts against the budget. Below 768 px the shell's bar shows the title and the first two actions, so a view declares its header once.

## The three columns

- **Sidebar**: name and primary destinations pinned at the top, one footer row pinned at the bottom, and only the groups between them scroll (`data-sidebar-scroll`). Items come from `SidebarItem`, groups from `SidebarGroup`. The footer row is the account control (avatar and name, opening a menu with Settings, Help, Keyboard shortcuts and Sign out), then the assistant, the bell, the sync dot and the collapse control. Counts: only Inbox and Today show theirs at rest; a project row uses `countMode="hover"` (shown on hover or focus, always on a coarse pointer), filter and label rows `countMode="hidden"`, and every count is in the row's name through `countLabel`. State is one accent dot (`StatusDot`) with its meaning in the tooltip and the name, never a filled badge; the danger colour is for errors.
- **Content**: the page template. The shell gives it the scroller; a view never adds one of its own.
- **Panel**: owned by the shell (`PanelHost`). Views open a task with `openTaskPanel(id)` (or `setPanelTaskId`) from `app/panel.ts`; the address carries `?task=<id>`. Other occupants (project activity, the planning list) use `openPanel(key, render)`.

## The task panel

Sticky header (checkbox, title wrapping to two lines, menu, close); notes as one placeholder line until focused, clamped to about eight lines at rest; four facet lines built by `facetsOf` in `web/src/lib/facets.ts` (Where, When, How always; Who when set) whose parts open `FacetEditor` popovers with Clear and Done, the When parts on one segment of the When popover; an Add menu grouped by facet; subtasks as a checklist; Comments, Activity, History and Time tabs with the composer resting as one line at the bottom. Parts use the row's words; no clear buttons between values. The words are **Do on**, **Start**, **Deadline**, **Evening**.

## Settings

Nine sections (Account, Appearance, General, Notifications, Capture, Integrations, Data, People, Server) in one layout: the section list beside the content from 1024 px, list-then-page below. A section is a card with a title, one line and rows; it has no header action. Its line may end with **Learn more** (`SettingsSection` `learnMore`, a Help screen id), which opens the card's guide section beside the page: the only way a card reaches Help (`settingsAnatomy.test.tsx`). A row shows state as a badge beside its label; a primary action is the control of the last row. The English text of every card, row, option and notice is one table, `web/src/lib/settingsCopy.ts`, keyed by the card's heading id; panels spread `cardCopy()` and `rowCopy()` into the primitives and never pass a description of their own.

## Rows and chips

- A row: a 24 px leading slot (chevron only with children), the checkbox, the title, a metadata line only when there is metadata, and, in Calm rows, a trailing counts group (`data-row-counts`: progress, notes, comments, attachments) in `text-faint` that turns `text-muted` on hover or focus within the row. It is never hidden and never a control.
- Two details, the user's `row_detail` preference (`useRowDetail()`): **Calm** (default) and **Detailed**. Detailed: tone text for the date and deadline (evening and repeat as suffixes of the date), label chips, neutral chips for estimate, progress, comments, attachments and project. Calm: the date muted except overdue (danger) and a timed today (accent), repeat as a muted `repeat` icon with its word, the priority ring coloured for P1 and P2 only, labels as `LabelDots`. No icon-only glyphs in either.
- A row leaves out only what its view or heading states: `ListRow.implied` from `listGroups()` (the day a heading names, This Evening, Someday), `omitLabel` in a label's view and `showProject`. A new fact a heading can imply is one more field there; a new count is one more entry in `rowCounts()`.
- Counts use tabular figures in the interface face, never a monospace face.
- Icon sizes: 16 px in rows, 20 px in headers, 12 px in chips.
- Empty views: one sentence, one primary action, one optional link; the key in the tooltip. Every task view renders them through `EmptyState` in `web/src/ui` with data (`title`, `action: { label, onClick, shortcut }`, `secondary`), never nodes, so a view cannot add an icon, a second line or a second button. `compact` is for an empty day inside a list of days. The `icon`, `body` and `control` slots are kept for the settings panels only, until those move to the same rule.

## Copy

Name the action first and the key second, and the key only on fine-pointer devices. Say what happens ("Moved to Home · Undo"), not what the system did. One idea per sentence. In Settings a title or label has at most 4 words, a card's, row's or notice's line at most 90 characters in English (a translation at most 120), and an option of a choice card at most 60; anything longer goes to the guide section the card's Learn more opens, and a safety warning keeps a one-line pointer on the card. `web/src/lib/settingsCopy.test.ts` checks all of it; confirmation dialogs keep their full consequence. The product words are listed in `docs/views.md` and `docs/tasks-and-projects.md`; four different things are never called the same name.

## The interface budget

Every change that touches a screen states in its design how it stays inside these limits (an OpenSpec rule in `openspec/config.yaml`). The measurable ones are tests.

| Limit | Value | Test |
| --- | --- | --- |
| Vertical scroll regions per screen | 3 | `budget.test.tsx`, layout check |
| Rows of chrome above a list's first item | 2 (header, quick add); nothing under the quick add, first-run guidance only as an overlay | `budget.test.tsx` |
| Task properties visible by default | 7 | `budget.test.tsx` (with the panel redesign) |
| Primary sidebar destinations | 6 | `budget.test.tsx` (with the navigation change) |
| New shortcuts | registered, no conflict | the shortcut registry test |

When a feature needs more than the budget allows, the answer is a menu, a chip, a panel occupant or a preference, not another row. Guidance that has to interrupt (the start guide) is a `Dialog`, with `placement="sheet"` so a phone keeps the page visible above it; the demo banner is one line above the shell at every width.
