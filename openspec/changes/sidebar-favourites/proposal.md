# Proposal

## Why

With `sidebar-groups` the sidebar folds and keeps its headers in view, but the things a person reaches for every day still sit in three different groups by kind: the pinned saved filters in Filters, the projects in a tree of thirty, the labels at the end. "Pinned" exists only for saved filters (`custom-views` "Pinned views in the sidebar"), and Projects is the one group without an "All" page, so the sidebar must list every project to keep each reachable. This change gives the user one pin for projects, labels and filters, a Favourites group that holds them together at the top of the scroller, and an All projects page so the sidebar can stay short (`UX-EXPLORATION.md`, section 4.2 C and D).

## What Changes

- **One pin for everything.** "Pin to sidebar" (checkable) appears in the menu of every project, label and saved filter, in the sidebar, on overview pages and in headers. Pinned items form a **Favourites** group at the top of the sidebar's scroller, mixed, in the user's order (Move up and Move down in the same menus), each with its icon or colour and its live open-task count, synced to the user's devices.
- **Filters lists every saved filter**, not only the pinned ones; a pinned filter is in Favourites. A saved filter's existing "Pinned to sidebar" item becomes the shared "Pin to sidebar", and its `pinned` field keeps its meaning for the API, the CLI and older devices.
- **All projects page** at `/projects`, reached from `g Shift+P`, the palette and an "All" action on the Projects header: the whole tree with counts, a find field, New project and From a template, and the archived projects behind a disclosure with their restore actions. Settings → Data links to it.
- **Group order** becomes Favourites (when any), Projects, Labels, Filters; Labels and Filters start collapsed on a device that has not stored a group state, since their items can be pinned.
- The favourites list is a new additive, synced user preference, like the promoted destinations; unknown kinds and missing ids are ignored, and saved filters pinned on an older device still appear.

No op field is renamed or removed; one additive field joins the user preferences record. No API route changes; no new environment variable. Not **BREAKING**.

**Out of scope**: Recents, the one-group-at-a-time layout, sharing favourites between members, pinning sections or tasks, and the task panel. Depends on `sidebar-groups` (group state, sticky headers, find) being archived first. ROADMAP.md item advanced: none directly; this continues the "Design refresh" programme.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Sidebar structure" (the Favourites group and the new group order, with Labels and Filters collapsed by default); new requirement for the Favourites group's behaviour.
- `appearance-preferences`: new requirement for the synced favourites preference.
- `custom-views`: "Pinned views in the sidebar" (pinned filters live in Favourites; the Filters group lists every saved filter) and the saved view menu item wording.
- `project-organization`: new requirements for pinning a project and for the All projects page; "Archived projects list" (moves to the All projects page, with Settings → Data linking there).
- `labels`: new requirement for pinning a label; "Label views and counts" (the Labels group is collapsed by default and pinned labels sit in Favourites).

## Impact

- **Code**: `internal/sync/ops.go` (`user_prefs.favourites`, additive), `web/src/lib/types.ts`, `web/src/lib/ops.ts` defaults, `web/src/lib/appearance.ts` (read and write the list, merge with `view.pinned`), `web/src/app/Sidebar.tsx` (Favourites group, order, defaults), the project, label and view menus (`ProjectHeader.tsx`, `LabelsView.tsx`, `ViewsView.tsx`), a new `ProjectsView.tsx` with the route `/projects` in `router.ts`, `ArchivedProjects.tsx` moved out of Settings, `web/src/lib/shortcuts.ts` (`go.projects`), the palette, the `Screens/Sidebar` stories and baselines, `docs/projects.md`, `docs/saved-views.md`, `docs/labels-and-filters.md`, `docs/archived-projects.md`, `docs/settings-data.md`, `docs/keyboard.md` (regenerated), `docs/api.md` (the preference field in the export).
- **Server and API**: the op schema gains one string field on `user_prefs`; the export includes it as it includes the other preferences. No new route.
- **Dependencies**: none added; the client grows by about 1 KB gzipped (the page and the group).
- **Interface budget**: primary destinations unchanged; the Favourites group lives in the existing scroller; the All projects page uses the page template (`list` width, two actions, an overflow menu); one new shortcut, `go.projects`, registered without conflict.
