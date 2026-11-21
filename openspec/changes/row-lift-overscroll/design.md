 # Design: row-lift-overscroll

 ## D1. The lift is the hold's progress

 `holdForRow` (`TaskRow.tsx:659-690`) already sets `data-touch-hold`. A CSS transition on `li[data-task-id][data-touch-hold]` with `transition-delay: 150ms` and `transition-duration: 200ms` on `transform` and `box-shadow`, using `--ease-spring`, gives the rise without a timer; the drag's own lift style takes over at 350 ms with the same values, so there is no jump. Sidebar rows (`rowMenuHold.ts`) get the same.

 ## D2. Android

 One line in `MainActivity.kt` after the WebView is created; nothing in the page changes.

 ## D3. Tests

 vitest pins the CSS; the layout check holds a row for 300 ms and reads a transform; a JVM test reads `overScrollMode`.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: none measurable (CSS). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no visible chrome.
