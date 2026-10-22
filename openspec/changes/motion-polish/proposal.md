# Proposal

## Why

The interface audit (OpenSpec change `ux-audit-three-widths`) measures movement under reduced motion (M15) on completing a task, opening the task panel and opening a dialog; its first run found none, because motion-v2 already removes movement there. Motion elsewhere was not measured: the board's drag placeholder, the sidebar drawer, the command bar, sheets on a phone, toasts outside the list, the Plan and calendar drops, and the screens whose layout shifts after load (M12) in a way an animation would make worse. This change measures each of them and, where an animation moves or scales an element under reduced motion, replaces it by a fade or nothing, or gives it the design a moving element needs.

## What Changes

- M15 runs on every overlay of the inventory and on the drag and drop of the board, Plan and calendar, not only the three moments it covers now.
- Every violation it finds is either removed (the reduced-motion variant the motion tokens provide) or redesigned when the motion carries meaning (a different, opacity-only cue).
- The audit's strict mode includes M15 once the list is empty.

Out of scope: motion that is already quiet; new animations. ROADMAP: advances "Next: Design refresh"; no row is closed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: `design-system` "Audited interface rules" already requires no moving animation under reduced motion.

## Impact

`scripts/ux-audit/tour.mjs` (M15 on more moments), the components the measurement names. No dependency.
