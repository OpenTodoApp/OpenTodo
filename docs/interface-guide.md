---
title: Interface guide
summary: How a screen of the web app is put together: the page template, the three columns, the task panel, settings, rows and chips, copy, and the interface budget every change stays inside.
audience: developer
section: Internals
specs: [design-system, web-app]
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
5. **Keyboard hints are discoverable, not printed.** Shortcuts appear in tooltips, menus, the palette and the cheat sheet, never as badges in the chrome, unless the "Show shortcut hints" preference is on.
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
| `full` | Board, Day and Week | the whole column |

The header is sticky inside the content column. A string title is truncated; pass a node for an inline rename field. `back` adds a back action for nested pages and phones. `children` is a second row (a segmented control, tabs) and counts against the budget. Below 768 px the shell's bar shows the title and the first two actions, so a view declares its header once.

## The three columns

- **Sidebar**: name and primary destinations pinned at the top, Help and the account pinned at the bottom, and only the groups between them scroll (`data-sidebar-scroll`). Items come from `SidebarItem`, groups from `SidebarGroup`.
- **Content**: the page template. The shell gives it the scroller; a view never adds one of its own.
- **Panel**: owned by the shell (`PanelHost`). Views open a task with `openTaskPanel(id)` (or `setPanelTaskId`) from `app/panel.ts`; the address carries `?task=<id>`. Other occupants (project activity, the planning list) use `openPanel(key, render)`.

## The task panel

Sticky header (checkbox, title, menu, close); notes as one placeholder line until focused; the project breadcrumb; property chips for properties with a value, Do on and Priority always present; an Add menu for the rest; subtasks as a checklist; Comments, Activity and History tabs with the composer pinned to the bottom. The words are **Do on**, **Start**, **Deadline**, **Evening**.

## Settings

Nine sections (Account, Appearance, General, Notifications, Capture, Integrations, Data, People, Server) in one layout: the section list beside the content from 1024 px, list-then-page below. A section is a card with a title, one sentence and rows; it has no header action and no help link of its own. A row shows state as a badge beside its label; a primary action is the control of the last row.

## Rows and chips

- A row: a 24 px leading slot (chevron only with children), the checkbox, the title, and a metadata line only when there is metadata.
- Metadata: tone text for the date and deadline (evening and repeat as suffixes of the date), label chips, neutral chips for estimate, progress, comments, attachments and project. No icon-only glyphs.
- Counts use tabular figures in the interface face, never a monospace face.
- Icon sizes: 16 px in rows, 20 px in headers, 12 px in chips.

## Copy

Name the action first and the key second, and the key only on fine-pointer devices. Say what happens ("Moved to Home · Undo"), not what the system did. One idea per sentence. The product words are listed in `docs/views.md` and `docs/tasks-and-projects.md`; four different things are never called the same name.

## The interface budget

Every change that touches a screen states in its design how it stays inside these limits (an OpenSpec rule in `openspec/config.yaml`). The measurable ones are tests.

| Limit | Value | Test |
| --- | --- | --- |
| Vertical scroll regions per screen | 3 | `budget.test.tsx`, layout check |
| Rows of chrome above a list's first item | 2 (header, quick add) | `budget.test.tsx` |
| Task properties visible by default | 7 | `budget.test.tsx` (with the panel redesign) |
| Primary sidebar destinations | 6 | `budget.test.tsx` (with the navigation change) |
| New shortcuts | registered, no conflict | the shortcut registry test |

When a feature needs more than the budget allows, the answer is a menu, a chip, a panel occupant or a preference, not another row.
