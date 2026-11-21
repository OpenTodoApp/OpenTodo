 # Design: ios-keyboard-bar

 ## D1. Removing the bar

 WKWebView's private `WKContentView` supplies `inputAccessoryView`. The common, App Store-accepted way is a runtime subclass of that view's class that overrides `inputAccessoryView` to return nil, applied once when the web view loads. It is guarded: if the class is not found, nothing changes (the bar stays).

 ## D2. Field in view

 `watchVisualViewport()` already scrolls the field with `scrollIntoView({block:'nearest'})`. It changes to computing the field's rectangle against `visualViewport.height + offsetTop` and scrolling the field's nearest scrolling ancestor by the shortfall plus 12 px, so sheets and panels keep the document still.

 ## D3. Tests

 XCTest for the override being in place; vitest for the scroll amount with a stubbed visual viewport; device check with a field at the bottom of the task panel and of a sheet.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 0.1 KB gzip (a change inside an existing function). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no new chrome; the accessory bar goes.
