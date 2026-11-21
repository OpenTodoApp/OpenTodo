# Proposal

## Why

On a phone a menu, a picker and some dialogs open as bottom sheets with a grab handle. The handle promises that the sheet can be dragged away, and it cannot (GitHub issue #1341, "Bottom sheets cannot be dragged away"; `mobile/AUDIT.md`, "no drag to dismiss on dialog sheets"):

- **A menu or picker sheet** (bulk actions, the add menu, notifications) does not move under the finger. It only closes after the finger has lifted more than 80 px lower, and only when the drag began on its top row, so a drag reads as ignored.
- **A dialog shown as a sheet** (the start guide, a routine's condition editor) has no handle and ignores a drag altogether.

Every native sheet follows the finger. This one gesture is a large part of why the app feels like a website on a phone.

## What Changes

- **Every bottom sheet follows a downward drag** that starts on its handle or header, and on its body while the content under the finger is not scrolled. Released more than 80 px down, or flicked down, it closes; otherwise it springs back.
- **A dialog shown as a bottom sheet gets the handle** and the same drag, through the same code as the menu sheet.
- **One rule for closing by accident.** A dialog that ignores a tap outside (`dismissable={false}`: destructive confirmations, a secret shown once) ignores the drag too and shows no handle.
- **A sheet dragged away leaves from where the finger left it**, the menu sheet included, instead of disappearing in place.
- **Reduced motion and no motion**: the sheet does not move with the finger; it closes or stays.

The X button, Escape, a tap outside and Android's Back are unchanged, and a drag closes through the same path, so focus returns to the trigger and the Back entry is removed as for any other close.

Out of scope: full-screen dialogs on phones (they are not sheets), the task page's swipe down on its header, dragging with a mouse, a sheet that snaps to more than one height, transitions between screens and the edge swipe (other changes), and any change to which overlays are sheets.

Advances the ROADMAP item "Shells that feel native" (the motion step of `mobile/AUDIT.md`: drag to dismiss sheets).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: a new requirement for dragging a bottom sheet away, and "Overlay motion" gains the exit of a sheet that was dragged away.

## Impact

- `web/src/ui/overlay`: a new `sheetDrag.ts` used by `Popover.tsx` and `Dialog.tsx` (the popover's own `dragToClose` is removed); one line in `exit.ts`.
- Visual: a dialog sheet shows the handle below 640 px (the start guide, the routine condition editor, the Overlay stories "Sheet" and "Bottom" at phone width). Their screenshot baselines change.
- No server change, no op field, no setting, no new string, no dependency, no new environment variable. The effect on the first load is in the design.
