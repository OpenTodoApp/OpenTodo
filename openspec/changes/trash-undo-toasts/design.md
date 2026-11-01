# Design

## Context

The toast primitive (`design-system` "Toast primitive") guarantees one toast at a time, a new one replacing the previous: batch offers hold ten seconds, one task's own action five. The undo offer lives in one module (`web/src/app/bulk/toastStore.ts`) so any list can raise it and the Shell renders it once. Focus sessions write their time entries through `web/src/lib/focus/session.ts`; a failure there was only logged.

## Decisions

### D1. A longer window only for the bulk Trash offer

The base batch window stays ten seconds. A bulk Trash offer holds fifteen seconds because the audit showed a large delete needs more time to decide, and a new offer replaces the previous one: a shorter window would cut off a pending Undo. The window is a parameter of the offer (`BulkToast.ttl`), not a change to the primitive.

### D2. Confirm above twenty

The shared confirmation dialog (`design-system` "Confirmation dialog") asks when trashing more than `BULK_TRASH_CONFIRM_FROM` (20) ticked tasks and never below it, so the common small trash stays immediate. The threshold is a constant in `BulkActions.tsx`, checked before the batch starts. A menu click stays immediate: only the keyboard's Delete on a selection goes through the count check.

### D3. Show Trash as the second control

The offer gains a "Show Trash" control that navigates to the Trash view. It is the second control the primitive allows, gives a path back after the Undo window closes, and reuses the existing navigation.

### D4. Every single-task delete uses the one undo path

The palette, Vim's `dd`, the Filter view and saved views called `deleteTask`, which writes the tombstone without an undo entry. They now call `deleteWithUndo`, the same function as the row menu, so the subtree semantics of `planTrash` and the toast label stay identical on every surface.

### D5. The failed time entry is an action toast, not an undo offer

A failed time-entry write has nothing to undo: it is a message with a tone and a dismiss, held in `toastStore.ts` beside the undo offer so its timing and reset stay in one place. It never offers Undo and never enters the undo state machine. The session still runs: start and stop failures report the consequence and continue.

### D6. The failure message waits for the offer

`ToastActionHost` does not render while the Undo offer shows. The one-toast guarantee is the requirement, and an overlay can hide the offer's Undo control. When the offer leaves, the waiting message takes the region with its full five-second window; the window starts when it is first shown, not when it was raised. The host reuses `useToastTimer` from `toastStore.ts`, applies `useToastClearance` like the offer, resets its hover and focus hold when the message changes or leaves, and handles Escape by dismissing and returning focus to the element that had it before the toast took it.

## Risks

- A person who relies on the ten-second window loses a third of the batch Undo window when the toast names a Trash; "Show Trash" and the longer window reduce the risk.
- A failure message waits while an Undo offer shows. On a screen where the pointer holds the offer, the message stays delayed; the offer is what the person is reading, so this is the wanted order.
