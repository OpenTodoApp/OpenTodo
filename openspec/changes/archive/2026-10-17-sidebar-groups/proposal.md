# Proposal

## Why

The sidebar's single scroller (app-shell "Sidebar structure") has 384 px of height for 1888 px of groups on a 1280×800 screen once an account has six pinned filters, thirty projects and twelve labels: one project is visible, the Labels group is 1362 px down, the group headers scroll away with their rows, and the only way to find a project is to scroll (`UX-EXPLORATION.md`, section 4). Width is adjustable; height is not. This change makes the groups fold, keeps their headers in view, opens the tree with its roots only, and adds a way to find a project, a label or a filter by typing.

## What Changes

- **Every group folds.** Filters, Projects and Labels are all collapsible (Projects and Filters are not today), the state is remembered per device, and a collapsed group shows its count on the header ("Projects 30").
- **Headers stay in view.** Group headers stick to the top of the scroller while their rows scroll, so the user always sees which group they are in and can close it from where they are.
- **The tree opens with its roots only.** On a device that has never stored a collapse state, projects with sub-projects start collapsed; the Projects header menu gains "Collapse all" and "Expand all". Navigating to a sub-project still reveals it.
- **Find in the sidebar.** A find field at the top of the scroller, opened from the Projects header, from the command palette and by a registered shortcut, narrows projects (keeping their ancestors), labels and filters together as the user types; Escape clears it. It works in the phone drawer.
- The More group, the primary destinations, the footer, the resizer and the icon rail are unchanged.

No data model, op schema or API change. No new environment variable. Not **BREAKING**.

**Out of scope**: a Favourites group and an All projects page (`sidebar-favourites`, which follows this change), reordering the groups, the one-group-at-a-time layout considered and set aside in the exploration, and any change to the task panel. ROADMAP.md item advanced: none directly; this continues the "Design refresh" programme after `ux-overhaul`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Sidebar structure" (all three groups collapsible, state per device, counts on collapsed headers); new requirements for sticky group headers and for finding in the sidebar.
- `project-organization`: "Collapse and expand" (roots collapsed on a device without a stored state; Collapse all and Expand all in the Projects header menu).

## Impact

- **Code**: `web/src/app/Sidebar.tsx` (group state, header menu, the find field), `web/src/ui/patterns/Sidebar.tsx` (`SidebarGroup` sticky header and count), `web/src/lib/projects.ts` (collapse defaults and bulk toggles), a new pure helper for sidebar matching in `web/src/lib`, `web/src/lib/shortcuts.ts` (one registered shortcut), the palette command list, `web/src/index.css` (sticky header surface), stories and baselines of `Screens/Sidebar` and `UI/Patterns/Sidebar`, `docs/getting-started.md`, `docs/projects.md`, `docs/keyboard.md` (regenerated).
- **Server and API**: none. Collapse state and group state stay device-local, as today.
- **Dependencies**: none added; the client grows by a few hundred bytes gzipped.
- **Interface budget**: primary destinations unchanged at five plus More; scroll regions unchanged (the headers stick inside the existing scroller); one new shortcut, registered without conflict.
