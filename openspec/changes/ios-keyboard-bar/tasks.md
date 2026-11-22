## 1. iOS

- [x] 1.1 Override `inputAccessoryView` on the content view; guarded when the class is missing; XCTest

## 2. Web

- [x] 2.1 `watchVisualViewport()` scrolls the nearest scroller by the shortfall plus 12 px; vitest with a stub viewport

## 3. Check

- [ ] 3.1 `npm test`, `npm run build`, `make bundle-budget` in web/; the iOS CI job
- [ ] 3.2 Device check rows on an iPhone: a title, the task panel's note, a sheet's last field, a hardware keyboard attached (no bar either way)
