# Design

## Context

See proposal.md for the motivation and `UX-EXPLORATION.md` section 4 for the measurements. The relevant facts for the approach:

- `web/src/app/Sidebar.tsx` renders three `SidebarGroup`s (`web/src/ui/patterns/Sidebar.tsx`) inside `[data-sidebar-scroll]`. Only Labels is `collapsible`, with React state that does not survive a reload; More's state is in `localStorage` (`ot.sidebar.more`). `SidebarGroup` already draws the chevron and a `badge` slot on the heading while closed.
- Per-project collapse state is the device-local meta row `collapsedProjects` (`web/src/lib/projects.ts`), read through a live query; `expandAncestorsOf` reveals a project on navigation. There is no notion of "never stored".
- The Projects header holds a `Menu` with "New project" and "From a template…".
- Sidebar rows are buttons; the shortcut dispatcher treats them as not typing, so single-key global shortcuts (`g`, `?`, `[`, `.`) fire while a row has focus.
- The palette (`web/src/app/palette`) already lists projects, labels and views by name, and registers commands from a static table.
- `budget.test.tsx` counts scrollers and primary items; `sidebar.test.tsx` covers the one-scroller model; `Screens/Sidebar` stories carry visual baselines.

Constraints: no new dependency, device-local state only, WCAG 2.2 AA in both themes from 360 px, every shortcut through the registry, the interface budget stated below.

## Goals / Non-Goals

**Goals:**
- A sidebar that fits an account with dozens of projects into 384 px without losing orientation.
- One mechanism for group state (all three groups behave alike).
- Finding by typing without leaving the sidebar, usable in the phone drawer.

**Non-Goals:**
- Favourites, an All projects page, reordering the groups (`sidebar-favourites`).
- Changing what the groups list or how counts are computed.
- ARIA tree type-ahead (typing letters on a focused row): it collides with the single-key global shortcuts, so finding goes through the field instead.

## Decisions

### D1. Group state lives beside More's
Each group's open state is a `localStorage` boolean `ot.sidebar.group.<filters|projects|labels>` read with the same try/catch wrapper as `ot.sidebar.more`, defaulting to open. `SidebarGroup` gains `count` (rendered after the title while closed, tabular figures) and keeps its `collapsible` API; the app passes `collapsible` for all three groups. The icon rail ignores group state, as it does today.

*Alternative:* a synced preference. Rejected: the spec says per device, and a laptop and a phone want different folds.

### D2. Sticky headers with CSS only
The heading row of `SidebarGroup` gets `position: sticky; top: 0` with `bg-canvas` and a `z-index` above the rows, inside the existing scroller; the group's `nav` stays the sticky container's parent, so the next header pushes the previous one out. The heading keeps its actions. Nothing is measured in JavaScript. Verified visually through the story baseline at 1280 and by the layout check, which already counts scrollers (none is added).

### D3. "Never stored" means roots collapsed
`collapsedProjects` keeps its shape (an array of ids). A second meta key, `collapsedProjects.initialised`, is written the first time the array is written. `readCollapsed(projects)` returns the stored set when the key is initialised and otherwise the ids of every project with children, without writing anything. The first explicit toggle (or Collapse all / Expand all) materialises the set and marks it initialised, so a user's first click on one chevron does not expand everything else. Existing devices already have the key, so they keep their state; no migration.

"Collapse all" writes every parent id; "Expand all" writes an empty array. Both join the Projects header menu under a separator below "New project" and "From a template…". Navigation keeps calling `expandAncestorsOf`, which materialises the set as above.

*Alternative:* a one-time migration collapsing existing devices too. Rejected per the exploration's open question 2: Collapse all is one click away.

### D4. Find is a pure match over the rows the sidebar already has
`web/src/lib/sidebarFind.ts` exports `matchSidebar(query, { rows, labels, views })`, returning the ids to show per group and the ancestor ids a matching project needs, using the Combobox's `match.ts` normalisation (case- and accent-insensitive prefix, then substring). The Sidebar renders the find field as the first element of the scroller when `finding` is true, filters each group through the result while the query is non-empty, forces matching ancestors open without touching stored collapse state, and hides groups without matches. Escape clears the query, closes the field and returns focus to the opener; Enter opens the first match; Up/Down move the active match. Choosing a match navigates and, in the drawer, closes it (the existing route-change effect in `Shell`).

Openers: a search `SidebarGroupAction` on the Projects header, a palette command "Find in the sidebar", and the shortcut `go.find` (`g /`, free in the registry, `global` scope, outside text fields). On the icon rail the shortcut expands the sidebar first.

*Alternative:* reuse the palette. Rejected for this problem: the palette is a dialog that covers the sidebar and closes the drawer; the user wants to see the tree narrow in place.

### D5. Interface budget
Primary destinations: five plus More, unchanged. Scroll regions: unchanged (sticky headers live in the existing scroller; the find field is not a scroller). Chrome rows above a list's first item: unchanged (the sidebar is not a list). Task properties: untouched. Shortcuts: one, `go.find`, registered in `web/src/lib/shortcuts.ts`; the conflict test covers it.

## Risks / Trade-offs

- [Sticky headers in a flex column with `overscroll-contain`] → sticky needs a scrolling ancestor, which `[data-sidebar-scroll]` is; the story baseline at 1280 and the layout check catch a regression. iOS Safari handles sticky inside an `overflow-y: auto` element.
- [Roots collapsed surprises a user who reinstalls] → the subtree count on a collapsed root keeps the information visible, "Expand all" is in the header menu, and navigation reveals.
- [`g /` is hard to discover] → the Projects header action and the palette command are the visible paths; the cheat sheet lists the key under "Go".
- [Filtering hides a group the user had open] → the find mode never writes group or project state; clearing restores exactly what was stored.
- [Drawer height on phones] → the find field takes one row; with groups collapsible, the drawer's first screen holds the primary destinations and the three headers.

## Migration Plan

Client-only, one release. New device-local keys only (`ot.sidebar.group.*`, `collapsedProjects.initialised`); nothing synced or exported changes. Rollback is a client rollback; stale keys are ignored.
