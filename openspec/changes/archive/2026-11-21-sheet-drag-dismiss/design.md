# Design

## Context

The overlay module (`web/src/ui/overlay`) has two bottom sheets:

- **The popover sheet** (`Popover.tsx`, every menu, popover and picker below 640 px). It has a handle. Its `dragToClose` reads only `touchstart` and `touchend` on the top row: the sheet never moves, and it closes when the finger lifts more than 80 px lower (phone-v2 D5). It closes at once, as menus do.
- **The dialog sheet** (`Dialog.tsx`, `placement="sheet"` below 640 px and `placement="bottom"` at every width). No handle, no drag. Its exit plays on a copy (`exit.ts`): the card slides down 1.5 rem and fades.

`Dialog` has one permission for closing by accident: `dismissable` (default true), which decides whether a tap on the scrim closes. `ConfirmDialog` and the dialogs that show a secret once pass `false`. The popover sheet has no such prop: a tap on its scrim always closes.

Every close goes through the overlay's `onClose`; unmounting releases the Back entry (`useBackToClose`) and returns focus (`useOverlay`).

## Goals / Non-Goals

**Goals:** one drag for both sheets; the sheet under the finger; scrolling content keeps scrolling; one permission; nothing new to configure.

**Non-Goals:** mouse dragging, snap points, dragging full-screen dialogs or the task page, a scrim that fades with the drag.

## Decisions

### D1. One hook, `useSheetDrag(sheet, onClose, enabled)`

`web/src/ui/overlay/sheetDrag.ts`. `Popover` calls it for its sheet presentation, `Dialog` for `bottom` and for `sheet` below 640 px (`useWide`, the breakpoint the module already uses). The popover's `dragToClose` is deleted, so there is one implementation.

It listens to touch events on the sheet element with native listeners, because `touchmove` must be non-passive to take the gesture from the scroller and React registers it passive. Touch only: a sheet is a phone presentation, and a mouse has the scrim and the X. Pointer events were rejected: the browser cancels them when it starts a scroll, and telling a body scroll from a sheet drag is the point.

### D2. Where a drag may start

- On the **grip** (`data-sheet-grip`: the handle strip and header row): always. The grip has `touch-action: none`.
- On the **body**: only when no element between the finger and the sheet has `scrollTop > 0`, and not in a field (`input`, `textarea`, `select`, editable content) or on an element with a drag of its own (`data-drag-id`, the convention of `docs/design-system.md`).

The direction is read after 8 px: mostly down becomes a drag (the hook then prevents the default, so the body does not scroll and the page does not pull); sideways or up gives the gesture back for good. The sheet never goes above its place.

### D3. Thresholds

Close when released more than 80 px down (the popover's existing number), or on a flick: faster than 0.5 px/ms at release (the row swipe's number, `rowSwipe.ts`) after at least 24 px, with the finger not resting more than 100 ms before lifting. Otherwise the sheet returns with `--duration-emphasis` and `--ease-spring`, the tokens of the sheet's entrance.

### D4. The offset is the CSS `translate` property

The drag sets `translate` on the sheet, not `transform`. The exit keyframes animate `transform`, and the two compose, so the dialog's exit copy, which keeps the inline `translate`, slides down from where the finger left it with no change to the keyframes. `exit.ts` clears `translate` on the copy's root, which it already places at the measured rectangle. Cleared after the drag, nothing is left that would make the sheet a containing block for fixed pickers inside it.

The popover sheet has no exit. Dragged away it would vanish under the finger, so its drag close plays the sheet exit on a copy (`playExit` with the `dialog-sheet` class). Closed any other way it still closes at once.

### D5. One permission

`Dialog`: the drag is enabled exactly when `dismissable` is, and the handle is drawn only then, so a sheet that cannot be dragged does not promise it. `onEscape` (Escape steps back in a two-view dialog) does not apply: the drag closes, as the scrim and the X do. The popover sheet is always draggable, as its scrim always closes.

An owner whose `onClose` does not close (it asks first) gets the sheet back in place 500 ms after the release. The wait is needed because many owners close a moment later, after a write (the start guide), and the sheet must not jump back first.

### D6. Reduced motion

With `prefers-reduced-motion: reduce` or `data-motion="none"` the hook never sets `translate` or a transition. The thresholds still apply on release. The exit is the existing fade, or nothing under no motion.

### D7. History and focus

Nothing new. The hook calls the overlay's `onClose`; the unmount pops the marker entry and restores focus as for the X. Verified in Chromium on a touch device: the marker is gone after a drag close.

### Data model, size

No op field, no table, no preference, no server change, no string. No dependency. `sheetDrag.ts` (about 110 lines, replacing the popover's 12) is in the first load because `Dialog` and `Popover` are. The first load stays inside the budget without raising it: 145.8 KB gzip for the entry chunk of 146, 703.8 KB with its static imports of 704.

### Interface budget

No screen gains a row of chrome, a property, a destination or a scroll region. The handle sits in the header's existing top padding. No shortcut. The drag has single-tap alternatives on every sheet (the X, the scrim), as WCAG 2.5.7 asks.

## Risks / Trade-offs

- **Real fingers.** Tested with synthetic touch events in happy-dom and with touch input in headless Chromium at 360 px. iOS Safari's rubber band and the on-screen keyboard are not covered; the tasks end with a check on a phone.
- **A body drag from the top competes with pull gestures** inside a sheet. No sheet has one today.
- **Baselines.** The handle on dialog sheets changes the screenshots of the start guide, the routine condition editor and two Overlay stories at phone width.
