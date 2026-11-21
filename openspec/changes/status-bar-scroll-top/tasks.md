## 1. iOS shell

- [ ] 1.1 Decoy `UIScrollView` with `scrollsToTop`; the web view's `scrollsToTop = false`; XCTest for the delegate posting the event
- [ ] 1.2 Capability `scroll-top` in `Bridge.swift` and the shared fixture; `make ios-test` (or the iOS CI job)

## 2. Web

- [ ] 2.1 `ui/scrollTop.ts` picks sheet, panel or `[data-main-scroller]`; vitest
- [ ] 2.2 Every page's main scroller carries `data-main-scroller`; a layout check test fails on a page without one

## 3. Check

- [ ] 3.1 `npm test`, `npm run build`, `make bundle-budget` in web/
- [ ] 3.2 Device check row on an iPhone: Inbox, a note, a calendar day and an open sheet
