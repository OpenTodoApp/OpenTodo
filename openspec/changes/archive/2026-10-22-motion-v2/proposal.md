# Proposal

## Why

Completing a task is the moment every task app invests in, and OpenTodo's is one 250 ms check-mark pop before the row vanishes: no strike, no reflow, no sense that the list made room. Rescheduling, dragging, bulk actions and Undo move rows with no transition at all, so the eye loses the task it was following; dialogs from 640 px up appear with no motion while the phone sheet slides. The design principle "delight is quiet" needs a few considered moments to be delight at all. Move 4 of the October 2026 interface analysis.

## What Changes

- **A completion sequence** on every task row and board card: the ring fills and pops, the title strikes through and fades, the row collapses while the rows below move up, and the Undo toast slides in, all within one new `--duration-moment` (400 ms). The completion op is written at once (local-first, offline, converges as today); the list keeps the row on screen as a *departing* row for the moment, so completing three tasks quickly never queues animations or blocks input. Undo during the moment cancels the departure. A repeating task, whose row stays and rolls to its next date, plays a quieter sequence (ring pops and reopens, the date crossfades, the row tints briefly); a habit adds the streak change.
- **List reflow** with the View Transitions API (`document.startViewTransition`, no dependency): when a local action moves tasks between groups, views or positions (complete, reschedule, drag, bulk action, Undo), the visible rows slide to their new places and new rows fade in. At most a bounded number of rows animate; a change of more rows, and every change that arrives from sync, applies instantly. Browsers without the API update instantly.
- **Overlay motion**: dialogs, sheets, the task panel and toasts enter with the new `--ease-spring` ease-out within the emphasis duration and leave in about three quarters of that; menus and popovers keep the 120 ms fade and close instantly. The phone sheet keeps its slide.
- **Haptic tick** on completion on devices with `navigator.vibrate`, behind a new synced preference `haptics` (on by default) in Settings → Appearance, which the existing long-press drag vibration follows too.
- **Workbench and gate**: a Foundations/Motion story set (completion, repeating completion, reflow, overlays) and a check in `make ui-check` that under reduced motion no movement or scale animation runs and under `data-motion="none"` none at all.
- The Focus clock, the Display routes and the e-ink presentation stay motion-free as today.

Out of scope: spring-physics libraries, overshoot or bounce, parallax, animated illustrations, motion on the Statistics charts, animating rows that arrive from another device, a motion preference beyond the system setting and the existing `data-motion="none"`. The exact easing curve and the row cap are tuned in the story without a spec change.

ROADMAP.md: advances "Next: Design refresh" (a new row for the motion step); no op-log format change beyond one additive `user_prefs.haptics` field; no new environment variable; nothing **BREAKING**.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: "Reduced motion" allows one 400 ms moment duration next to the 120 and 250 ms transitions, names the spring ease, and states what reduced motion and no motion keep; a new requirement puts the motion sequences in the workbench with an automated reduced-motion check.
- `task-list-presentation`: "Completion feedback" becomes the full completion sequence (departing row, written-at-once op, repeating and habit cases, cards); a new "List reflow" requirement bounds the View Transitions use.
- `web-app`: a new "Overlay motion" requirement (entrance and exit timing per overlay kind) next to "Consistent overlay behaviour".
- `appearance-preferences`: a new "Haptic feedback preference" requirement (additive, synced, offline).

## Impact

- Web: `web/src/index.css` (tokens `--duration-moment`, `--ease-spring`, the sequence keyframes, view-transition pseudo-element rules), `web/src/app/motion.ts` (the transition helper, the departing-row timer, the haptic helper), `web/src/app/TaskRow.tsx`, `web/src/app/TaskListView.tsx` and `BoardView.tsx` (departing rows, transition wrapping of list updates), `web/src/app/listActions.ts`, `web/src/app/bulk/UndoToast.tsx`, `web/src/ui/overlay/Dialog.tsx`, `Toasts.tsx`, `web/src/app/PanelHost.tsx`, `web/src/app/calendarDrag.ts` (preference), `web/src/app/AppearanceSection.tsx` (switch), new `web/src/ui/foundations/Motion.stories.tsx`, new `scripts/ui-check/motion.mjs`.
- Data: additive `user_prefs.haptics` in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`; not a content field.
- Dependencies: none. Bundle: about 2 KB gzipped of CSS and helpers. Server binary: unchanged beyond the schema entry.
- Docs: `docs/design-system.md` (Motion), `docs/interface-guide.md` rule 10 (unchanged wording, the sequence named), `docs/settings-app.md` (the haptics switch), CHANGELOG.
