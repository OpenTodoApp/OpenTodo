# Design

## Context

See proposal.md for the motivation. The current state that shapes the approach:

- Motion lives in `web/src/index.css`: `--duration-ui` 120 ms, `--duration-emphasis` 250 ms, `--ease-calm`; `row-check-pop` on the check mark; `dialog-sheet-up` for the phone sheet only (centred dialogs from 640 px have `animation: none`); menus and popovers have no animation; the sidebar drawer uses `transition-transform`. Reduced motion is one global rule that limits `transition-property` to colour and opacity and makes animations run once instantly; `data-motion="none"` zeroes every duration (design-system "High-contrast and no-motion presentation", used by Display mode and e-ink).
- Completion today (`web/src/app/TaskRow.tsx`, `web/src/app/motion.ts` `completionDelay`): the row sets a local `completing` state, waits the emphasis duration, then calls `onToggle`, which writes the op. The write is therefore delayed by 250 ms, and nothing animates the rows below.
- Lists (`TaskListView.tsx`, `BoardView.tsx`) are keyed by task id and re-render from one shared read ("Large lists stay responsive"); long lists are virtualised, so only on-screen rows exist in the DOM.
- Undo is one batch store (`web/src/lib/undo.ts`) and one toast (`web/src/app/bulk/UndoToast.tsx`, `ToastRegion` in `web/src/ui/overlay/Toasts.tsx`); the toast appears and disappears without motion.
- `navigator.vibrate(10)` already fires when a long press lifts a calendar block (`calendarDrag.ts`), with no preference.
- Appearance preferences are additive `user_prefs` fields (`mode`, `theme`, `density`, `row_detail`), synced and offline.
- Open changes touching the same specs: `calm-rows` modifies task-list-presentation "One row anatomy", "Metadata language" and appearance-preferences "Appearance in Settings"; `lean-chrome` modifies "Nothing between the header and the list" and "Empty views"; `ux-feedback-2` modifies "Selected row indicator". None touches "Completion feedback", design-system "Reduced motion" or web-app "Consistent overlay behaviour". This change MODIFIES only those three untouched requirements and otherwise ADDS requirements (D9).
- `tokens-v2` (another change of this batch) owns the token set; this change needs two tokens from it, `--duration-moment` and `--ease-spring` (D1).

## Goals / Non-Goals

**Goals:**
- One satisfying completion moment that never slows the write, the keyboard or sync.
- Rows that visibly make room when things move, with no library and a hard cost ceiling.
- Overlays that enter the same way everywhere, and leave faster than they came.
- Every sequence reduced correctly under the system setting and the no-motion attribute, checked by a machine.

**Non-Goals:**
- Physics springs or overshoot: the "spring" ease is an ease-out curve, and nothing bounces (interface-guide rule 10).
- Animating changes made by other devices or by the importer and agents: a list must never move under a reader's eyes for a reason they did not cause.
- Motion on charts, the Focus clock or the Display routes.
- A user-facing motion preference beyond the system setting: the no-motion attribute stays a presentation knob for displays.

## Decisions

**D1. Two tokens, owned by `tokens-v2`.** `--duration-moment: 400ms` and `--ease-spring: cubic-bezier(0.22, 1, 0.36, 1)` (an ease-out quint with no overshoot) join the motion tokens. `tokens-v2` defines them in `web/src/index.css` and the design-system token table; if this change applies first it adds the same two lines and `tokens-v2` keeps them. Tailwind utilities `duration-(--duration-moment)` and `ease-spring` follow the existing `@theme inline` pattern. Alternative: a fourth and fifth duration for exits. Rejected: exits are "about three quarters" of an entrance and are written as `calc(var(--duration-emphasis) * 0.75)`, so the token set stays at three durations.

**D2. The op is written first; the list keeps a departing row.** `toggle` in `TaskRow` calls `onToggle()` immediately and no longer waits `completionDelay()`. The list (not the row) decides what happens next: `TaskListView` and `BoardView` keep a `departing: Map<taskId, {at, kind}>` in a ref; when a row that was rendered in the previous frame disappears from the grouped data because it was completed locally in the last 400 ms (the action records the id in a small module-level set in `motion.ts` just before the write), the list renders it one more time from its last known row model with `data-departing`, done state, `aria-hidden`, `inert`, and removes it when the moment ends. Counts, `posInSet` and `setSize`, the keyboard cursor and the drag targets all come from the grouped data, so a departing row is invisible to them by construction ("Departing row is not a target"). Undo looks the id up: if it is departing, the entry is dropped and the real row simply renders again with a 120 ms fade-in. Alternative: keep delaying the write as today. Rejected: it delays persistence and sync, makes the cursor wait, and blocks a second completion for 250 ms; the analysis asked for the write at once. Alternative: animate in the row component with `onAnimationEnd` before notifying the list. Rejected: the row cannot know whether it is leaving (Today) or staying (a project's Completed group, a repeating task).

**D3. Timing of the completion sequence.**

| From | To | What | Property | Reduced motion | No motion |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | op written, counts update, haptic tick | | same | same |
| 0 | 120 | ring fills (border and background to the done colours) | colour | same | instant |
| 0 | 250 | `row-check-pop` (scale 0.8 → 1.15 → 1) | transform | none | none |
| 60 | 260 | strike-through draws left to right (a pseudo-element `inline-size` 0 → 100%); title and metadata fade to 50 % | inline-size, opacity | opacity only, 120 ms | instant |
| 200 | 400 | row collapses (`block-size` and padding to 0, opacity to 0); rows below move up through the view transition (D4) | block-size, transform, opacity | row removed at 120 ms with opacity fade, no movement | removed at once |
| 200 | 450 | Undo toast enters (translateY 8 px → 0, opacity) | transform, opacity | opacity | instant |

Everything the row does is CSS on `data-departing`; no JavaScript timers besides the 400 ms removal. A repeating task (`completeTask` rolls the series: the row stays with a new date) gets `data-rolled` instead of `data-departing`: rows 0 to 250 as above, then the ring returns to its open state at 250 ms, the date text crossfades (two stacked spans, 120 ms) and the row carries `bg-accent-soft` for 250 ms before fading back; nothing collapses. A habit is a repeating task whose streak chip also crossfades its number. Alternative: one shared 250 ms fade for everything. Rejected: that is what exists and reads as the row vanishing.

**D4. View transitions, bounded.** A helper `withListTransition(affectedRowIds, update)` in `web/src/app/motion.ts` runs `update()` inside `document.startViewTransition()` with `flushSync` only when all hold: the API exists; `prefers-reduced-motion` is not set; the root has no `data-motion="none"`; `affectedRowIds.size <= 40`; the change is local (the caller is a list action, not the sync applier); no text field inside the list has focus; the document is visible. Otherwise it calls `update()` directly. Rows get `view-transition-name: task-<id>` only while the transition runs (set in the update callback on the rows the virtualiser renders, cleared on `finished`), so a 2,000-row list snapshots only its viewport. A new call while a transition runs calls `skipTransition()` on the old one first. Group headers and the quick add get stable names so they do not crossfade. The pseudo-element rules in `index.css` set `animation-duration: var(--duration-moment)` and `--ease-spring` on `::view-transition-group(*)`, and only opacity on `::view-transition-old/new(*)`. Sync batches never animate (D2 of the non-goals): the applier does not go through the helper. Alternative: a FLIP implementation with measured rects. Rejected: more code, the same result, and it fights the virtualiser. Alternative: animate remote arrivals with a fade. Deferred as an open question; nothing in the spec forbids adding it later.

Browser support, to be re-verified in task 2.1 at implementation time: Chromium 111+ and Edge 111+ (March 2023), Safari 18+ (September 2024), Firefox 144+ (October 2025) ship same-document view transitions. Older browsers take the direct path and differ in nothing else.

**D5. Overlay entrances and exits.** Dialog from 640 px: `dialog-enter` (opacity 0 → 1, scale 0.98 → 1) over `--duration-emphasis` with `--ease-spring`; exit `dialog-exit` over 75 % of it, the component staying mounted until `animationend` (a `closing` state in `Dialog`, with a 300 ms safety timeout). The phone sheet keeps `dialog-sheet-up` but moves from `--duration-ui` to `--duration-emphasis` and gains the matching exit. The task panel (`PanelHost`) animates `translate` from its edge only on the closed → open edge; a change of the shown task re-renders content without re-mounting the frame. Toasts: `toast-enter` (translateY 8 px, opacity), exit by opacity over 75 %. Menus, popovers, tooltips and the palette: fade in over `--duration-ui`, unmount at once on close, because a 90 ms exit on a menu reads as lag and the chosen action's effect should be visible immediately. Alternative: exit animations on everything. Rejected for menus and popovers on that ground. Under reduced motion every entrance is `*-fade` (the pattern `dialog-sheet` already uses); under no motion durations are zero.

**D6. Haptics preference.** New additive `user_prefs.haptics` (`on` | `off`, default `on`): `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`; not a content field; nothing to migrate (preferences materialise from the op log). A helper `tick()` in `motion.ts` calls `navigator.vibrate(10)` when the preference is on and `'vibrate' in navigator`; completion and the drag lift both call it. The switch is a `SettingRow` in Appearance, rendered only when `'vibrate' in navigator`, with copy in `web/src/lib/settingsCopy.ts`. Alternative: tie it to the Focus sound switch. Rejected: sound at the end of a session and a tick on completion are different moments and the sound switch is a Focus setting. Alternative: no preference. Rejected: a device that buzzes on every tick with no way to stop it is the first thing a user turns off, and the only switch they would find is the system one.

**D7. Spec placement.** design-system "Reduced motion" is MODIFIED (its "no more than 250 ms" must change). task-list-presentation "Completion feedback" is MODIFIED (no open change touches it). Everything else is ADDED: design-system "Motion sequences in the workbench", task-list-presentation "List reflow", web-app "Overlay motion" (rather than editing "Consistent overlay behaviour", which has no timing today), appearance-preferences "Haptic feedback preference" (rather than "Appearance in Settings", which `calm-rows` modifies; when `calm-rows` archives, a follow-up line adds the haptics row to that requirement's list, task 5.4).

**D8. Interface budget.** No new chrome, row, scroll region or shortcut; one settings row on a page that has them. The departing row occupies the space the real row had, so nothing above the first item changes. Visible task properties are unchanged.

**D9. Workbench and gate.** `web/src/ui/foundations/Motion.stories.tsx` takes over the Motion section of `Layout.stories.tsx` and adds the sequences with a "Play" control each, over seeded rows from `app/stories/fixtures.tsx`. `scripts/ui-check/motion.mjs`, run by `make ui-check` after `a11y.mjs`, opens each motion story twice: with `page.emulateMedia({ reducedMotion: 'reduce' })`, plays it and reads `document.getAnimations()` during the moment, failing on any animation whose keyframes touch `transform`, `translate`, `scale`, `height`, `block-size`, `width` or `inline-size`; then with `data-motion="none"` on the root, failing if `getAnimations()` is not empty. `a11y.mjs` already zeroes durations before measuring and is unchanged. Visual baselines are taken at rest (before and after a sequence), never mid-animation.

**D10. Size and performance.** No dependency. About 1.2 KB gzipped of CSS and about 0.8 KB of helpers. A view transition snapshots the rows it names; capped at 40 named rows plus the group headers, a low-end phone (4× CPU throttle in the audit tour) must keep the moment under 400 ms wall time; task 6.2 measures it, and if it fails the cap drops to the viewport's rows only. The departing row is one extra render per completion. Server memory and binary: unchanged beyond one schema entry.

## Risks / Trade-offs

- [Jank on low-end phones during a view transition] → hard cap on named rows, no transitions during typing, measured on a throttled CPU in the audit tour, and the cap can drop without a spec change.
- [A list moving under the user because of a remote change] → sync batches never go through the helper; only the actor's own action animates.
- [A departing row confusing assistive technology] → it is `aria-hidden` and `inert`; the live count and the toast's status region announce the change.
- [Undo racing the departure] → Undo drops the departing entry first; the real row renders again; a test covers Undo at 50, 200 and 450 ms.
- [Safari before 18 or Firefox before 144] → the direct path; the spec promises nothing beyond an instant update there.
- [Exit animations keeping a dialog mounted after `onClose`] → a `closing` state with a 300 ms safety timeout, and tests that focus returns to the trigger before the exit ends.
- [Reduced motion rules in `index.css` diverging from the new sequences] → the automated check in D9 fails on any transform that survives.
- [The two tokens landing twice] → identical values in both changes, and a unit test that the token exists once.

## Migration Plan

No data migration: `user_prefs.haptics` is an additive field read with a default. Deploy as an ordinary release; older clients ignore the field. Rollback: revert the web build; the field is harmless to a server or client that does not know it.

## Open Questions

- Should rows that arrive from another device fade in (opacity only, no movement)? Deferable: the spec forbids movement for sync changes and says nothing about a fade; it can be added later without changing the approach.
- The exact ease curve and the 40-row cap are tuned in the story and the measurement task; both are implementation values the specs state only as bounds.
