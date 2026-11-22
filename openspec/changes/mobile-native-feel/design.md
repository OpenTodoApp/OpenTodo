# Design: mobile-native-feel

## Context

Facts this plan rests on (2026-11-21, main after 1.6.0):

- Motion tokens exist (`--duration-ui` 120 ms, `--duration-emphasis` 250 ms, `--duration-moment` 400 ms, `--ease-calm`, `--ease-spring`; `index.css:138-231`) and View Transitions already run for list reflow (`motion.ts:243-297`), but not between pages. The router is our own (`router.ts`, `navigate()` at 477).
- The edge swipe (`edgeSwipe.ts`) acts on release only; the page does not follow.
- Touch presses dim at once on every ancestor (`index.css:1685-1693`); eight raw `:hover` rules are unguarded; focus rings ignore how focus arrived.
- iOS shell: no `inputAccessoryView` handling, no status-bar tap, no `UIKeyCommand` or pointer code, no ActivityKit. Haptics have two kinds (`tick`, `success`) on both shells.
- Android shell: no overscroll setting, no ongoing notification, no `resizeableActivity`.
- Tablets: three panes from 1024 px only; layout check widths 360, 390, 768.
- Budget: the entry chunk is at 147.4 of 148 KB gzip; first load 702.5 of 712 KB.

## D1. Order

Cheap wins first, so testers feel progress early and the later steps build on a calmer base:

1. Phase 1, small and independent (any order, one PR each): `press-feedback-delay`, `touch-input-mode`, `row-lift-overscroll`, `haptic-kinds`, `status-bar-scroll-top`.
2. Phase 2, motion: `page-transitions`, then `swipe-back-follows` (it drives the same back animation), and `ios-keyboard-bar` in parallel.
3. Phase 3: `focus-live-activity`, as already planned.
4. Phase 4, tablets: `tablet-layouts` starts with its audit; `tablet-shells` follows and shares the audit.

## D2. Rules every step follows

- Motion uses the tokens and honours reduced motion and `data-motion="none"`; a gesture still works with motion off.
- Web first: what the web layer can do, it does (testable in the layout check, works in the PWA too); the shells add only what a web view cannot.
- Bridge changes are additive capabilities, listed in the shared fixtures; an older shell or a browser keeps today's behaviour.
- Budget: nothing grows the entry chunk without an equal cut; new code is lazy where it can be.
- Each step adds rows to the device check list (`mobile/AUDIT.md`, "Device check, after each step") and runs them on at least one iPhone and one Android phone (and an iPad for phase 4) before it is archived.

## D3. Per step: effort, place, acceptance, test, size

| Step | Effort | Where | Accepted when | Tested by | First-load cost |
|---|---|---|---|---|---|
| page-transitions | M | web | deeper pages slide in, back slides out, top level cross-fades, chrome stays, none with reduced motion | vitest, layout check trace, device check | < 1 KB, lazy if needed |
| swipe-back-follows | M | web | page follows the finger, commits at 33% or a flick, springs back otherwise | vitest over widths, layout check touch drag at 390 and 768 px, device check | ~0.5 KB in the lazy edge chunk |
| press-feedback-delay | S | web | press shows after 60 ms, never during a scroll, innermost only | layout check computed opacity, device check | ~0 |
| ios-keyboard-bar | M | both | no accessory bar; focused field 12 px above the keyboard in its own scroller | XCTest, vitest, device check | ~0.1 KB |
| status-bar-scroll-top | S | both | status bar tap scrolls the frontmost scroller to the top | XCTest, vitest, device check | ~0.2 KB with the bridge code |
| haptic-kinds | S | both | selection on switches and segments, error on failure toasts, tick on lift; older shells fall back | XCTest, JVM test, vitest, device check | ~0.2 KB |
| touch-input-mode | S | web | no stuck hover, no ring after a tap, ring for keyboard and pointer | repo check, vitest, layout check | ~0.3 KB |
| row-lift-overscroll | S | both | row rises during the hold; no Android glow | vitest, layout check, JVM test, device check | ~0 |
| focus-live-activity | M | both | as in that change | as in that change | as in that change |
| tablet-layouts | L | web | panes by available width (600 and 900 px steps), state kept across resizes | layout check at 744, 1024, 1180 px portrait and landscape, device check | 1-2 KB |
| tablet-shells | M | both | iPad shortcuts and overlay, fine pointer, any window size; Android resizable and fold-safe | XCTest, JVM test, device check | ~0.1 KB |

## D4. Measure of success

The plan succeeds when the same testers who compared us with TREK and Todoist, given the same script (add three tasks, complete one, open a task and go back by swipe, edit a note with the keyboard, scroll a long list and return to the top, run a Focus session with the phone locked, and on an iPad, work with a keyboard in split view), rate the app at least as native-feeling as TREK, and name no item of this list as "feels like a website". Until then, each step's device check rows passing on real devices is the interim measure. The script and the ratings are kept in `mobile/AUDIT.md`.

## Data model, size and budget

- Data model: none for the whole plan. No op field, no synced preference beyond the existing `user_prefs.haptics`.
- Container image and server memory: unchanged.
- First load: about 3-4 KB gzip in total across all steps, mostly lazy; each step proves its own with `make bundle-budget`.
- Interface budget (docs/interface-guide.md): no step adds chrome; `tablet-layouts` asserts at most 2 rows of chrome above a list's first item and at most 3 vertical scroll regions at each tablet width.
