 # Design: tablet-shells

 ## D1. Keyboard

 WKWebView already delivers key events to a focused page on iPad. The shell adds `UIKeyCommand`s with `discoverabilityTitle` for the shortcut overlay (new task, search, go to Today, Inbox, Upcoming), each posting the page's own shortcut id over the bridge (`opentodo:shortcut`), so the shortcut registry stays the one source; keys the page handles itself are not duplicated.

 ## D2. Pointer

 iPadOS reports `(pointer: fine)` and `(hover: hover)` inside WKWebView when a trackpad is attached; the audit task confirms it, and if it does not, the shell sets `data-pointer="fine"` through the bridge on `UIPointerInteraction` hover.

 ## D3. Windows

 Android: `resizeableActivity="true"` and the existing `configChanges` keep the activity alive across resizes and fold changes; WindowManager's `WindowInfoTracker` reports a hinge so a later change could avoid it (not now).

 ## D4. Tests

 XCTest for the key commands posting ids; a JVM test reads the manifest; device checks on an iPad with a Magic Keyboard and on an Android tablet or foldable.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 0.1 KB gzip (the shortcut event listener). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no new chrome.
