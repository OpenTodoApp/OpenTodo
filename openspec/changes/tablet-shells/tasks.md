## 1. iPad

- [ ] 1.1 Audit: key events, pointer media queries and Stage Manager sizes in the current app; findings in design.md
- [ ] 1.2 `UIKeyCommand`s for the main shortcuts posting shortcut ids; XCTest
- [ ] 1.3 Fine pointer and hover with a trackpad (bridge fallback only if the audit needs it)

## 2. Android

- [ ] 2.1 `resizeableActivity="true"`; resize and fold keep state; JVM test reads the manifest

## 3. Check

- [ ] 3.1 `make android`; the iOS CI job; `npm test` in web/ for the shortcut event
- [ ] 3.2 Device check rows on an iPad with a Magic Keyboard (shortcuts, overlay, pointer, split view, Stage Manager) and an Android tablet or foldable
