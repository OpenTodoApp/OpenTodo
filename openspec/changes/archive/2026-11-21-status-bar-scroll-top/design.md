 # Design: status-bar-scroll-top

 ## D1. Why a decoy scroll view

 iOS sends the status bar tap to the one scroll view on screen with `scrollsToTop` that can scroll. The web view's scroll view cannot scroll (the page scrolls an inner element), so it receives nothing. A hidden 1×1 `UIScrollView` with `contentSize` taller than its frame, `scrollsToTop = true`, and a delegate that returns false from `scrollViewShouldScrollToTop` after posting the event, receives the tap and never moves.

 ## D2. Bridge

 The shell calls `window.dispatchEvent(new CustomEvent('opentodo:scroll-top'))` through `evaluateJavaScript`, the same path as the other shell-to-page events. `capabilities` gains `scroll-top`. The shared fixture lists it, so the bridge version is unchanged (additive).

 ## D3. Which element

 `ui/scrollTop.ts` picks the topmost open sheet or panel scroller, else the page's `[data-main-scroller]`, which each page already marks for scroll restoration (or gains). It calls `scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })`.

 ## D4. Tests

 XCTest for the delegate posting the event; vitest for the element choice; device check on an iPhone with a long list, a note and an open sheet.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 0.2 KB gzip, loaded with the shell bridge code (not the entry chunk when no shell is present). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no visible chrome.
