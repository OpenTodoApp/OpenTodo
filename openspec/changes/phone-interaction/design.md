# Design

## Context

Overlays all go through `web/src/ui/overlay/useOverlay.ts`, which answers Escape through the shared stack, captures focus, restores it to the trigger and locks the page's scroll. All of them are mounted while open and unmounted when closed. The router keeps the address in `history` (`pushState` on a route, `replaceState` when asked) and re-renders when it reads a new one; it has one `popstate` listener that tracks the address and a leave guard for pages with unsaved changes.

Below 768 px the sidebar is rendered as a fixed drawer that slides in from the left edge, with a scrim over the page. It is always in the document, at every width: from 768 px it is the column beside the content.

`TaskRow` opens a task on the row's click and on the title button's click; Shift and Ctrl/⌘ clicks tick instead when the list passes `onTick`. `TaskListView` already holds the phone "Select tasks" state (`selectMode`) and shows the checkboxes with it.

The quick add row's sticky classes are one exported constant, `STICKY_QUICK_ADD`, applied from 768 px.

## Decisions

**D1. One marker history entry per open overlay, owned by the overlay hook.** `useBackToClose(isOpen, onClose)` pushes `{overlay: n}` at the current address when an overlay opens on a coarse pointer and pops it when the overlay closes. `useOverlay` calls it, so every overlay gets the behaviour in one place instead of each dialog remembering. Depth `n` is the overlay's place in the stack, not a growing counter, so a closed overlay that reopens reuses the entry below rather than stacking markers. Alternatives: a single entry for the whole stack (rejected: Back must close one overlay at a time, and a dialog over a dialog is common); a `popstate` handler per component (rejected: every overlay would need the same bookkeeping and the stale-marker cases below).

**D2. Releases are batched after the commit.** When overlays close together (a dialog and its nested dialog, a navigation that closes a panel and a sheet), each cleanup schedules one microtask flush instead of popping immediately, so `n` entries are popped with one `history.go(-n)`. A re-mount in the same commit (StrictMode, a keyed remount) takes its entry back instead of adding a second. A marker that nobody owns is stepped over on the next Back, so a route that replaced the entry above it cannot trap the user.

**D3. A navigation under an open overlay replaces the marker.** `navigate()` writes `replaceState` when the current entry is a marker, so the drawer's destination replaces its entry: the page behind stays one Back away instead of returning to a marker that would reopen nothing. The overlay closes as the route changes, as before.

**D4. Touch only.** The hook does nothing without a coarse pointer. With a mouse, Back is the browser's history control, and the desktop keeps Escape and the close controls; making Back close an overlay under a mouse would also break the browser's own expectation that Back leaves the page.

**D5. The drawer is the same element in both roles.** From 768 px it is inert-never and always in the accessibility tree; below 768 px it is inert and `aria-hidden` while closed and an overlay while open, with `inert` on the page behind it. One media query, `DESKTOP_HEADER_QUERY`, decides which role applies, so resizing the window swaps the roles without a reload. Alternative: a second, phone-only drawer element (rejected: two copies of the sidebar, two sets of ids and two scroll positions).

**D6. Tab stays in the drawer through the existing helper.** The drawer's own `onKeyDown` calls `trapTab` while it is the open overlay, the same helper the dialogs use; the overlay stack gives it Escape and the single focus capture, and focus returns to the menu button because the key press that opened it is remembered by `captureFocus`.

**D7. Select mode reuses the pointer path.** `TaskRow` gains `selectMode`, and both of its click handlers treat it like Shift/Ctrl/⌘: tick through `onTick` and do not open. Drags, swipes, the disclosure button and the checkbox keep their own paths, and the desktop never sets the prop.

**D8. A variant, not a second class list.** The sticky classes use a `pins` custom variant: `(width >= 48rem) and (not ((pointer: coarse) and (height < 500px)))`. The row is sticky, and paints its surface, only where it may stick, and `revealRow` counts it from the computed position, so a landscape phone stops treating it as pinned with no JavaScript. Alternative: a `max-height` override after the `md:` utilities (rejected: the order of generated utilities decides it, and it would leave the pseudo-element painting the page surface).

## Data model

No synced field, entity or op. The history markers live in `history.state` for the life of the page and are device interface state, like a scroll position; nothing is written to the server, and an overlay reopened after a reload simply pushes a fresh entry.

## Interface budget

No new chrome: no row above a list, no task property, no sidebar destination and no shortcut. At most the existing two rows of chrome above the first task, one scroll region per column, and the drawer's rows stay 48 px on touch. The quick add row is unchanged in height; it only stops being pinned in one viewport shape.

## Size

No dependency. The hook and its export add under 2 KB of source (about 700 bytes gzip in the main bundle); the CSS variant adds one media query and moves existing utilities behind it, so the built sheet does not grow.
