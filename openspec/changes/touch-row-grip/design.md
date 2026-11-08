# Design: the grip owns selection, the body's hold owns the menu

## One gesture, one owner

Every press on a row resolves to exactly one thing, decided by where it starts:

| Where | Pointer | Gesture | Result |
| --- | --- | --- | --- |
| Row body | any | tap | open/select as before |
| Row body | any | hold, still, release | the actions menu at the finger |
| Row body | any | hold, then move | the drag (or a scroll before the hold) |
| Grip (coarse only) | coarse | tap | tick / untick + haptic |
| Grip (coarse only) | coarse | hold, still | the same tick, idempotent |
| Grip (coarse only) | coarse | move | the drag lifts at once, carrying the ticked selection |

The grip is rendered only where `pointer: coarse` is the primary pointer, so a laptop with a touchscreen keeps the current row; the phone's row never offers both gestures in the same place.

## Why the grip never scrolls or selects words

The grip sets `touch-action: none` and `user-select: none`, so the browser keeps no gesture for itself: movement is always a drag, never a scroll, and never a word selection. That is the point — the row body's long press lost its tick to the grip precisely because it had to coexist with scrolling and the platform's text selection.

The row body keeps `user-select: none` on touch screens too (coarse pointer only), so a held row no longer hands its text to the browser while the press arms. Form controls inside a row are exempt: the inline title editor and other fields must still select their text.

## Drag ownership

`beginDrag` in `lib/dnd.ts` gains a `grip` mode: movement lifts immediately (no hold wait), a held release never opens the menu, and `onHold` (the tick-while-held feedback) is wired to the grip only. The row body keeps the existing two-phase hold — arm during the hold interval with held feedback, lift only on movement after it — which is what the keyboard-less touch drag has always done; only its *tick* side is removed, since the grip owns that.

`startDrag(e, task, grip)` resolves its feedback onto the row's `<li>` (`closest('li')`) so the tint and the board placeholder's height come from the row, not the grip.

## The selection box

The native checkbox keeps its semantics (`aria-pressed`, form semantics) but is drawn by the app: `.row-tick` is `appearance: none`, 20 px, 4 px radius, accent fill and tick when checked — the same slot and size as the completion circle beside it, on every browser and device, instead of the platform's native control choosing its own offset.

## What does not change

Selection remains device state: never an operation, never synced, never an offline conflict. The menu, its pickers, the review step and Undo are untouched; this change only decides *which gesture opens it* and *which gesture ticks*.
