# Proposal

## Why

Four interactions on a phone do not do what the screen promises, and each one costs a person time or data:

- **Back leaves the page behind an open overlay.** Android's back gesture and button are how a phone user dismisses a sheet, a menu, the command palette or the phone drawer. Today the browser's Back moves the page underneath: the overlay stays open over a different list, or a task page opened from it is left behind, and the user has to find the overlay's own close control to get back to where they were.
- **The closed phone drawer is still reachable.** Below 768 px the drawer sits off screen but stays in the document: sighted keyboard users tab into an invisible drawer between the menu button and the page, and a screen reader reads its find field, destinations and account footer as part of every page. Opened, the drawer also leaves the page behind it reachable, so Tab leaves the drawer and lands on content that is visually hidden under the scrim.
- **Select mode opens the task it should tick.** On a phone, "Select tasks" shows a checkbox on every row. A tap anywhere else on the row (the title, or the empty space beside it) still opens the task, at the moment the person is building a selection to act on several tasks at once. Only the checkbox itself ticks.
- **The quick add covers the list in landscape.** From 768 px wide the quick add row is pinned under the page header. A phone held sideways is wider than 768 px and shorter than 500 px, so the pinned row plus the page header take most of the short viewport and the first rows sit under them.

## What Changes

- **Back closes the open overlay.** On a touch device every open overlay (dialog, menu, popover, sheet, the command palette, a task panel's dialog, and the phone drawer) owns one history entry at the address it was opened from. The system Back closes the topmost overlay and leaves the page where it is; a second Back navigates as it always did. Closing an overlay any other way removes its entry, so history never accumulates markers. A navigation made from inside an overlay replaces the marker instead, so Back returns to the page the overlay was opened from.
- **The phone drawer is an overlay when open and inert when closed.** Closed below 768 px, the drawer and everything in it are `inert` and hidden from assistive technology, so it leaves the tab order and the accessibility tree. Open, it is an overlay: focus moves into it, Tab stays inside it, the page behind it is `inert` and does not scroll, Escape or Back closes it, and focus returns to the menu button. From 768 px the sidebar is a column: never inert, never hidden, always part of the page.
- **In Select mode a tap on a row ticks it.** While "Select tasks" is on, a tap anywhere on a row ticks or unticks it instead of opening it, exactly as Shift or Ctrl/⌘+click does with a pointer. The checkbox keeps its own behaviour; Done still leaves the ticks in place. With Select mode off nothing changes.
- **A landscape phone leaves the quick add unpinned.** The pinned quick add row applies from 768 px except on a coarse pointer under 500 px tall, where it scrolls with the list as it does on a narrow phone. The floating Add button stays the always reachable add control there.

Not **BREAKING**: no op field, route, environment variable or stored value changes. The history markers are device state and are never synced.

## Out of scope

- The browser's Back on a fine pointer (a mouse or trackpad): closing an overlay with Back is a touch behaviour, and the existing Escape and close controls continue to serve the desktop.
- Any redesign of the drawer, its scrim, the Select mode bar or the quick add row; the layout, sizes and copy stay as they are.
- Long press, swipe and drag selection: unchanged, and unchanged by Select mode.
- The floating Add button's placement and the tab bar's behaviour while scrolling.

## Roadmap

No milestone item: this corrects behaviour shipped with the phone work in 0.11 to 0.19 (`phone-v2`, `precision-phone`, `bulk-actions`, `add-position`).

## Capabilities

### Modified Capabilities

- `web-app`: an open overlay closes on Back on a touch device.
- `app-shell`: the phone drawer is inert when closed and takes over the page when open.
- `bulk-actions`: a tap on a row in Select mode ticks it instead of opening it.
- `task-list-presentation`: the quick add stays unpinned on a landscape phone.

## Impact

- **Web only:** `web/src/ui/overlay/useBackToClose.ts` (new), `useOverlay.ts`, `web/src/app/router.ts`, `web/src/app/Shell.tsx`, `web/src/app/TaskRow.tsx`, `web/src/app/TaskListView.tsx`, `web/src/app/task-list/ListGroups.tsx`, `web/src/app/task-list/stickyQuickAdd.ts` and one custom variant in `web/src/index.css`.
- **Data, sync and server:** no change. No op, migration, route or field; nothing is written to the server.
- **Interface budget:** nothing is added above a list, no task property is added, no sidebar destination and no shortcut.
- **Copy:** no new visible string, so the six catalogs and the iOS String Catalog are unchanged.
- **Size:** about 1.5 KB of source; no dependency, no new chunk.
