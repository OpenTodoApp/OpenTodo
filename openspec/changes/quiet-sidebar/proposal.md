# Proposal

## Why

The 0.7.2 sidebar made room ("A roomier sidebar on a computer": Search by the name, Help in the icon row, More as a menu), but it still speaks in numbers and badges. At 1280 px a typical account shows Inbox 8, Today 10, a filled amber "Review due" badge on More, three filter rows with counts, three project rows with counts and a people icon, three label rows with counts, four icon buttons in the footer with a red "2" on the bell, and an account row with its own gear. Twelve numbers and three coloured marks compete before the first task, most of them results (a filter's matches, a label's usage) rather than work to do, and the two markers that do deserve attention (a due review, an unread notification) use the loudest styles the design system has. This change keeps the counts that drive action, moves the rest to hover and to the accessible name, turns state markers into one quiet dot language, and folds the footer into one row, continuing the "Design refresh" programme of `ROADMAP.md` and items A3 ("Counts stay only on Inbox and Today"), A5 and H3 of `UX-AUDIT.md`.

## What Changes

- **Counts only where they drive action.** Inbox and Today keep their counts. A project's count is shown while its row is hovered or focused (always on a touch screen, which has no hover) and is always in the row's accessible name. Filter rows and label rows show no count in the sidebar; their accessible names carry it, and the Filters overview (`g v`), the Labels overview (`g l`) and each page header keep showing the numbers. Upcoming never had a count and stays without one. Collapsed group headers keep their item count ("Filters 6"), the unread badges of shared projects and of Updates stay (they are `activity-feed` requirements and name what other people did), and a saved filter whose query no longer parses keeps its error mark.
- **Filters and Labels start folded on a new device**; Projects starts open. The state is still remembered per device as today (`ot.sidebar.group.<id>`), and a group with nothing in it is still hidden (app-shell "No empty groups", from `sidebar-compact-desktop`).
- **One dot for state.** The rhythm marker on More and on the Review entry becomes a small dot in the accent colour, with "Review due · the last weekly review was 9 days ago" (and the monthly or daily rhythm when due) in the tooltip and the accessible name, never a filled badge. When nothing is due the entry carries no marker; when the last review was lives in the tooltip and, in the More menu, in the item's description. The notification bell uses the same language: a dot for one unread notification, a small accent count above one, never red.
- **One footer row.** The four icon buttons and the account row merge into one row: the avatar and name open the account menu (Settings, Help, Keyboard shortcuts, then Sign out, each with its registered shortcut), followed by the assistant launcher when the owner turned the assistant on, the notification bell, the sync dot and, from 1024 px, the collapse control. Help and the cheat sheet remain reachable from `g ?` and `?`, from every page header's Help action, from the cheat sheet and from the command palette ("Open Help", "Keyboard shortcuts" already exist there). Sign out from the menu opens the same confirmation as Settings → Account. On a phone the row keeps 44 px targets, and the icon rail stacks the same controls.
- Touch screens keep their larger targets and the inline More group (0.7.2). Nothing is written or synced for any of this: the only stored state is the existing per-device group state.
- Stories and visual baselines (`Screens/Sidebar`, `UI/Patterns/Sidebar`), the axe gate, `sidebar.test.tsx`, `notificationBell.test.tsx`, and the end-to-end script that reads sidebar counts (`scripts/e2e-views.mjs`) are updated with the change.

No new dependency, route, shortcut, op field, setting or environment variable. No change to the op log format. Not **BREAKING**.

**Out of scope**: the Places arrangement of Open Loops first (its six primary destinations and their order are unchanged; only the Review entry's marker changes form), favourites and the All projects page (the open change `sidebar-favourites`), the phone bottom bar, the shared-project marker on project rows, the unread badges of `activity-feed`, the content of the notifications list, and the server.

**Relation to `sidebar-favourites`**: both changes touch app-shell "Sidebar structure", labels "Label views and counts" and custom-views "Pinned views in the sidebar". They agree: `sidebar-favourites` already makes Labels and Filters closed by default on a device without a stored state (its D5) and this change relies on that; this change's deltas are written against the requirement texts as `sidebar-favourites` leaves them (the Favourites group, the Projects–Labels–Filters order, every saved filter listed), and add the count rule to them. A favourite row follows the count rule of its own kind (a project's count on hover, no count on a label or a filter). `sidebar-favourites` archives first; this change is applied and archived after it. If `sidebar-favourites` is abandoned, the sentences about Favourites in this change's deltas are dropped on archive and the defaults sentence here stands on its own.

**Advances**: `ROADMAP.md` "Next: Design refresh" (the sidebar as the first screen of the refreshed language), and `UX-AUDIT.md` A3, A5 (quiet status) and H3 (badges out of the chrome).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Sidebar structure" (the count rule, Filters and Labels folded by default, the one-row footer with the account menu); "Compact sidebar on a desktop" (the footer row's contents and names); new requirements "Quiet markers in the sidebar" (the dot language for the rhythm marker, counts revealed on hover and present in the accessible name) and "Notification bell marker" (a dot for one unread notification, an accent count above one).
- `project-organization`: "Open task counts" (a project's count on hover, focus and touch, always in the accessible name).
- `custom-views`: "Pinned views in the sidebar" (no count in the sidebar row; the count in the accessible name, the overview and the page header).
- `labels`: "Label views and counts" (no count in the sidebar row; the count in the accessible name and the overview; the group closed by default).
- `weekly-review`: "Rhythm markers" (the marker is a dot with the rhythm text in the tooltip and accessible name; no marker when nothing is due; "last review" in the tooltip and the More menu description).

## Impact

- **Web app**: `web/src/app/Sidebar.tsx` (count rule per row, group defaults, `reviewMarker`, `SidebarFooter` rewritten around an account menu), `web/src/app/NotificationBell.tsx` (dot or count), `web/src/ui/patterns/Sidebar.tsx` (`SidebarItem` gains a quiet count and a `data-open-count` hook), `web/src/index.css` (one `@layer components` rule for the quiet count), `web/src/app/LabelsView.tsx` (`LabelRow` count), `web/src/app/Shell.tsx` (passes the sign-out handler to the sidebar), `web/src/app/sidebar.stories.tsx`, `web/src/ui/patterns/Sidebar.stories.tsx`, tests `sidebar.test.tsx`, `notificationBell.test.tsx`, `budget.test.tsx` (unchanged assertions, re-run), `shell.test.tsx`; the six message catalogs in `web/src/locales/` for the new strings.
- **Scripts**: `scripts/e2e-views.mjs` reads counts from `data-open-count` instead of the rows' text; `scripts/e2e-layout.mjs` keeps `[data-notifications]`.
- **Docs**: `docs/built-in-views.md` (which numbers the sidebar shows), `docs/projects.md` (project counts on hover), `docs/labels-and-filters.md` and `docs/saved-views.md` (counts in the overview and the header, not the sidebar), `docs/review-and-statistics.md` (the dot), `docs/notifications.md` (the bell), `docs/getting-started.md` and `docs/settings.md` (Help, Settings and Sign out from your name at the bottom of the sidebar), `docs/interface-guide.md` (the footer and the count rule), `docs/images/sidebar-*.webp` and `docs/images/notifications-*.webp` regenerated; `CHANGELOG.md` under Unreleased on archive.
- **Specs**: the five capabilities above.
- **Server, API, CLI, MCP, sync, data model**: untouched.
- **Size**: no dependency; the client changes by about +0.3 KB gzipped (the account menu and the tooltip text, minus the orange badge, two icon buttons and the settings glyph). Binary and container image unchanged.
- **Interface budget**: primary destinations unchanged (four, six in Open Loops first); scroll regions unchanged; no new shortcut; the footer loses one row.
