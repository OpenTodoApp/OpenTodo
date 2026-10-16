# Design

## Context

See proposal.md for the motivation and `UX-EXPLORATION.md` section 4.2 (C and D). The relevant facts:

- The user preferences record (`user_prefs`, one row per user, `web/src/lib/types.ts` `UserPrefs`, schema in `internal/sync/ops.go`) already carries `sidebar_destinations` as a comma-separated string, read and written by `web/src/lib/appearance.ts` through `mutate()`; unknown entries are dropped on read and kept in the row. The favourites list follows the same pattern.
- Saved views have a synced `pinned` boolean and a `position` (`custom-views`), exposed through the API, the CLI and the export; the sidebar's Filters group lists the pinned ones and `ViewMenu` offers "Pinned to sidebar".
- Projects and labels have no pin; both are rendered in the sidebar from live queries (`Sidebar.tsx`, `LabelRow` in `LabelsView.tsx`), with menus in `ProjectHeader.tsx`, the sidebar row and the labels overview.
- Archived projects are listed in Settings → Data (`ArchivedProjects.tsx`, `settingsSections.ts`); `docs/archived-projects.md` describes it.
- `sidebar-groups` provides collapsible groups with per-device state (`ot.sidebar.group.<id>`, default open), sticky headers and `matchSidebar`.
- Free `g` keys include `r`; `go.*` entries live in `web/src/lib/shortcuts.ts` and drive the sidebar's hints, the cheat sheet and `docs/keyboard.md`.

Constraints: additive op schema only, every write through `mutate()`, favourites are personal (a shared project must not carry a member's pin), no new dependency, the interface budget.

## Goals / Non-Goals

**Goals:**
- One pin concept and one word ("Pin to sidebar") for projects, labels and saved filters.
- A Favourites group that converges across devices and tolerates older devices that only know `view.pinned`.
- Every project reachable in one click from a short sidebar.

**Non-Goals:**
- Pinning sections, tasks or dashboards' panels.
- Sharing favourites between members or per-project defaults.
- Recents.

## Decisions

### D1. `favourites` is one additive string field on `user_prefs`
`favourites` holds an ordered, comma-separated list of `kind:id` entries (`project:<id>`, `label:<id>`, `view:<id>`). One field, so the order across kinds is one last-writer-wins value and two devices never interleave halves of a list. Added to `Schema` in `internal/sync/ops.go` as a string, to `UserPrefs` in `types.ts` and to `USER_PREFS_DEFAULTS` in `ops.ts`; it is not a content field (ids only), so the E2EE field lists are untouched. The export carries it with the rest of the row.

*Alternative:* a `pinned` field on projects and labels, like views. Rejected: projects are shared and a pin is personal; labels are per user today but one model for all three kinds is simpler to explain and to converge.

### D2. The Favourites list is derived from two sources
`favouritesOf(prefs, views)` in `web/src/lib/favourites.ts` returns the entries of `favourites` that resolve to a live, non-archived item, followed by any view with `pinned === true` that the list does not name (by position), and drops a `view:` entry whose view has `pinned === false`. Pinning a view writes both (`pinned: true` and the list entry) in one batch; unpinning clears both. So an older device that toggles `pinned` alone still converges to a sensible list, and the API's `pinned` keeps meaning "in the sidebar's Favourites".

*Alternative:* migrate `view.pinned` away. Rejected: it is an API and CLI field, and `custom-views` requires it.

### D3. One `PinItem` menu item
A `MenuItem` with `checked`, labelled "Pin to sidebar", built once and used by the project menus (sidebar row, header, All projects page), the label menus (row, overview, view header) and `ViewMenu` (replacing "Pinned to sidebar"). Move up and Move down in a favourite's menu reorder the list when the menu is opened from the Favourites group, and the item's own position otherwise; the `Sidebar` passes a `within: 'favourites'` flag to the menu it renders there.

### D4. Favourites rows reuse the group's rows
The Favourites group renders a `SidebarItem` per entry with the same leading element and count as the item's own group (project mark and subtree count, label dot and count, filter icon and evaluated count), active when its route is current, and the same menu. Projects in Favourites are flat (no tree, no chevron); a favourite sub-project shows its path in the tooltip through the existing full-path tooltip.

### D5. Group order and defaults
Order: Favourites, Projects, Labels, Filters. Labels and Filters default to closed when `ot.sidebar.group.<id>` is absent, Projects to open, Favourites always open (it has no chevron; its header has no actions). This is the only behaviour that differs from `sidebar-groups`, whose defaults this change replaces.

### D6. The All projects page
`ProjectsView.tsx` at route `{ view: 'projects' }` (`/projects`), `PageHeader` titled "Projects" with New project and From a template as the two actions and the overflow menu for Collapse all and Expand all; `PageBody` with `list` width. The tree reuses the sidebar's `buildProjectTree` and `flattenTree`, a find field reusing `matchSidebar` restricted to projects, and `ArchivedProjects` moved under a disclosure (`<details>`-like, closed by default, opened when the address carries `#archived`). Settings → Data keeps a "Archived projects" row whose control is a link to `/projects#archived`. Shortcut `go.projects` (`g r`), palette entry "Go to Projects", and `SidebarGroupAction` "All" on the Projects header, matching Labels and Filters.

### D7. Interface budget
Primary destinations unchanged. Scroll regions unchanged (Favourites is in the scroller; the page uses the content scroller). Chrome on the All projects page: the header and the find field, two rows, within the allowance. One new shortcut, registered.

## Risks / Trade-offs

- [A favourite's item is deleted on another device] → `favouritesOf` drops entries that do not resolve, without writing; the entry is kept in the row so a restore brings it back.
- [Two devices reorder concurrently] → the whole string is one LWW field; the later write wins and nothing is duplicated (entries are de-duplicated on read).
- [Users look for "Pinned to sidebar" in a view's menu] → same position, new label, same check mark; the Help page for saved views says so.
- [Labels and Filters closed by default hide things the user used to see] → only on devices without a stored group state; the headers show counts and stick; favourites carry the ones that matter.
- [The All projects page duplicates the sidebar tree] → both render the same pure helpers; the page is the place for finding and archived projects, the sidebar for navigation.

## Migration Plan

Server: the schema entry is additive; older servers forward the field untouched (schema rule). Client: one release; devices without the change ignore `favourites` and keep `view.pinned`. Settings → Data's archived list becomes a link in the same release. Rollback is a client rollback; the field stays in rows and is ignored.
