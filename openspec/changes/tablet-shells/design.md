 # Design: tablet-shells

 ## D1. Keyboard

 WKWebView already delivers key events to a focused page on iPad. The shell's web view (`ShellWebView`) adds `UIKeyCommand`s for the shortcut overlay: Cmd+N Add task, Cmd+K Search, Cmd+1 Inbox, Cmd+2 Today, Cmd+3 Upcoming (capability `key-commands`, pinned by the bridge fixture key-commands.json). Each posts the page's shortcut id (`opentodo:shortcut`), and the page presses that shortcut's own keys through the one dispatcher (`lib/shellShortcuts.ts`): the registry stays the one source, a screen's override applies (the calendar's `q`), and it works while a text field has focus. Only those five ids are accepted. Every other key reaches the page as typed.

 ## D2. Pointer

 iPadOS reports `(pointer: fine)` and `(hover: hover)` inside WKWebView when a trackpad is attached; the audit task confirms it, and if it does not, the shell sets `data-pointer="fine"` through the bridge on `UIPointerInteraction` hover.

 ## D3. Windows

 Android: `resizeableActivity="true"` and `configChanges` keep the activity alive across resizes and fold changes. `configChanges` also gains `keyboard` and `navigation`: before, attaching a keyboard cover or a trackpad recreated the activity and reloaded the web view (only `keyboardHidden` was there). WindowManager's `WindowInfoTracker` reports a hinge so a later change could avoid it (not now).

 ## D4. Tests

 XCTest for the key commands posting ids; a JVM test reads the manifest; device checks on an iPad with a Magic Keyboard and on an Android tablet or foldable.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 0.1 KB gzip (the shortcut event listener). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no new chrome.
