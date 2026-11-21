 # Design: row-lift-overscroll

 ## D1. The lift is the hold's progress

 `data-touch-hold` is set only when the hold arms at 350 ms, too late for a rise. The shared hold (`lib/dnd.ts` `trackHold`) therefore takes a `press` element and marks it `data-touch-press` from the touch until the hold ends (an early release, a move past the drag threshold, a cancel, or the drag lifting). Task rows pass it from both paths (`holdForRow` in `TaskRow.tsx` and `useListDrag` through `beginDrag`), and sidebar rows from `rowMenuHold.ts`. A CSS rule on `li[data-task-id]` and `[data-sidebar-scroll] [data-sidebar-item]` with that mark sets the drag's lift values (`scale(1.01)` and `--shadow-2`) with a transition of 200 ms and a 150 ms delay on `transform` and `box-shadow`, using `--ease-spring`. That gives the rise without a timer. When the drag lifts, its own lift classes carry the same values. An early release eases back through the row's own transition, which now includes `box-shadow`; the sidebar item gets the same transition. The rule lives under `(pointer: coarse)` and `(prefers-reduced-motion: no-preference)`, and not under `data-motion="none"`, so reduced motion keeps only the hold's tint. The background keeps the 60 ms wait of `press-feedback-delay`.

 ## D2. Android

 Both web views (`activity_main.xml`, `activity_sign_in.xml`) say `android:overScrollMode="never"` in their layout, the same as the one line in `MainActivity.kt` and the sign-in screen, but in one place each; nothing in the page changes.

 ## D3. Tests

 vitest pins the CSS and checks that `beginDrag` marks the pressed row from the touch until an early release or the lift, and never for a mouse. The layout check sends a touch pointer event to a row's title, reads the row's scale after 300 ms (risen) and 400 ms after the release (settled), then the same under `reducedMotion: 'reduce'` (still). Without the CSS it reports that the row has not risen. A JVM test reads every layout's web view for `overScrollMode="never"`.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: none measurable (CSS). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no visible chrome.
