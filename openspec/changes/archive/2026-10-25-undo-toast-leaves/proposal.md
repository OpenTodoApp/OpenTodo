# The toast after Undo leaves

## Why

Issue #348: after **Undo** in the toast, the "Undone." toast never left. Clicking Undo focuses the button, the toast pauses while focus is inside it, and Undo then removes its own button. In Chrome the toast never learned that focus had left, so it stayed paused for good. Toasts also had no close button or Escape, so there was no way to get rid of it.

## What Changes

- After Undo, the toast reads the hold (pointer over it, focus inside it) from the page instead of relying on focus and pointer events, and the result gets its own five seconds; it then leaves.
- The Undo toast gets a close button (Dismiss, an `x`), and Escape with focus inside dismisses it and returns focus to where it was. The close button is not one of the toast's two actions.
- The assistant's toast, which already had a close button and a timer, also closes on Escape.
- Prompts that wait for an answer (reminders, the daily check, the break reminder) keep their own controls and stay until answered (app-shell "Notices are toasts").

Not **BREAKING**: no op, API or storage change.

## Impact

- `web/src/app/bulk/UndoToast.tsx`, `web/src/app/assistant/AssistantRoot.tsx`; tests `web/src/app/bulk/undoToastLeaves.test.tsx`, `toast.test.tsx`.
- CHANGELOG and the user docs that describe the toast.
