# Proposal

## Why

GitHub issue [#1380](https://github.com/OpenTodoApp/OpenTodo/issues/1380): the first interface tour at 768 px with touch (2026-11-14, a tablet held upright, the sidebar 256 px wide) showed the sidebar giving its room to controls, not to names.

- A project's row read "Home re…" beside its members mark, its count and a 44 px "⋯" menu button; a favourite read "Deep work and every…". With a mouse the button shows on hover, in the count's place. On touch there is no hover, so it stood on every row and took the room the name needs.
- The foot cut the account's name to "Ada L…", in one capture to "A…" beside "Syncing…".
- The tour's overlap rule M11 reported `"waiting, 1 open task" × "Schedule"` on 57 screens at 768 px, and in the phone drawer project rows against the foot's buttons. Measured: the list's scroller cuts those rows there, and a finger at that place meets the foot's control. The rule compared whole boxes, including the part scrolled out of the list.

## What Changes

- On touch a sidebar row with a menu (a project, a label, a saved view, a favourite, a pinned note) no longer shows its "⋯" button, so the name has its room. Holding the row opens the menu, the gesture a task row already has: the row tints when the hold arms, the menu opens on release, a move is a scroll (or the drag of a row that can be dragged). The button stays at the end of the row for the keyboard and for assistive technology: it shows over the count while it has keyboard focus, and a screen reader finds and presses it there. Counts stay.
- On touch the foot shows the account's name whole or the avatar alone. The sync state is its dot: a running sync shows no words, and the states that need attention ("Offline · 2 pending") show theirs only where they fit whole. The words take their room before the name.
- The audit's M11 compares the part of a control's box that lies inside its scroll containers, and does not compare a stuck element (a drawer's group heading) with the content of its layer that scrolls under it.

With a mouse nothing changes.

Out of scope: the sidebar's width, its row height and indentation, the members mark and the count on a project's row, a right-click menu on sidebar rows with a mouse, the Labels and Views pages (their rows keep the button), the icon rail, and the foot with a mouse (the name still truncates there).

Advances the ROADMAP item "Shells that feel native" (the phone and the tablet read like an app, `mobile/AUDIT.md`); the web app in a touch browser gets the same sidebar.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: new requirements "Sidebar rows on touch give the name the room" and "Sidebar footer on touch shows whole words".

## Impact

- `web/src/index.css` (the row menu button on a coarse pointer, the hold's tint, `ui-whole`), `web/src/app/rowMenuHold.ts` (new: the hold), `web/src/app/Sidebar.tsx`, `FavouritesGroup.tsx`, `LabelsView.tsx`, `notes/NotesSidebar.tsx` (the rows are marked), `SidebarFooter.tsx`, `SyncStatus.tsx` (the words).
- `scripts/ux-audit/audit-measures.mjs` (M11) and `scripts/ux-audit/measure.mjs` (the layout check's touch targets leave out a control that takes no taps), with fixtures in `measure.test.mjs`; `scripts/ux-audit/layout-screens.mjs` opens a sidebar view's menu from the keyboard.
- Tests in `web/src/app/rowMenuHold.test.tsx`, `sidebarFooter.test.tsx`, `SyncStatus.test.tsx`; `docs/sidebar-counts-and-order.md`, `docs/design-system.md`.
- No op field, no route, no new string, no dependency, no server change. The first load stays inside its budget.
- Visual baselines change for touch captures that show the sidebar: every screen at 768 px and the open drawer at phone widths (no "⋯" on rows, the avatar alone in the foot where the name does not fit).
