# Design: the toast after Undo leaves

## Decisions

- **D1 Read the hold from the page when the message changes.** The toast pauses while hovered or focused, tracked with React focus and pointer events. A focused control that unmounts (Undo removing itself) may produce no blur the toast sees, so on each new message the toast sets the hold from `contains(document.activeElement)` and `:hover`. Alternative: remount the toast with a new key after Undo; rejected because it replays the enter motion.
- **D2 The result gets its own time.** "Undone." used to inherit what was left of the offer's timer. It now shows for the single-action time, five seconds, also after `Ctrl+Z`.
- **D3 A close button outside the two-action limit.** The primitive allows two actions (Undo, plus Open and the like); the close button only closes and sits last: an `x` icon named "Dismiss", with an Esc hint. Escape acts only with focus inside the toast, so it never competes with the Escape of lists and panels.
- **D4 Focus goes back.** Escape or the close button, used from the keyboard, return focus to the element that had it before Tab entered the toast.
