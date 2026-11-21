## 1. Shells

- [ ] 1.1 iOS: `warning`, `error`, `selection` in `Bridge.swift`; XCTest
- [ ] 1.2 Android: the same in `Haptic.kt`; JVM test
- [ ] 1.3 Shared fixture `haptics.json` gains the kinds; both shells and web read it

## 2. Web

- [ ] 2.1 `selection` in Switch and SegmentedControl on touch changes; vitest with a stub shell
- [ ] 2.2 `error` for the failure toast; `tick` on drag lift (`lib/dnd.ts`); vitest

## 3. Check

- [ ] 3.1 `npm test`, `npm run build`, `make bundle-budget` in web/
- [ ] 3.2 Device check rows on an iPhone and an Android phone: each place, and haptics off plays nothing
