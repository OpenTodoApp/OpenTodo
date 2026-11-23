# Proposal

## Why

"Use my location" in a task's location editor works in the Android app, which answers the page's request for the position (requirement "Position for the web app"). The iPhone app declares no location permission, so WebKit never gets a position and the editor says the browser did not share it. The owner asked for the iPhone app to do what the Android app does, for the server's own pages only.

## What Changes

- **The iPhone app declares `NSLocationWhenInUseUsageDescription`**, translated like its other usage descriptions. With it, WebKit answers a page's `navigator.geolocation` request and iOS asks once for the app's location while in use.
- **Other origins are turned away.** WebKit gives an app no per-origin answer for the position, so a script runs at the start of every frame, before the page's own scripts. On any page other than the configured server's (a sign-in provider, a frame it embeds, a look-alike host, another port or scheme), it replaces `navigator.geolocation` with one that refuses at once with `PERMISSION_DENIED`, without a prompt. The first-run sign-in sheet and the background run refuse every page.
- **Tests:** `WebLocationTests` run the script in JavaScriptCore for the server's page, other origins, and no server. They also call a frame's `Navigator.prototype` getter on the page's own navigator, and pin the two known limits below.

### Known limits

WebKit does not run an app's scripts in a frame's first empty document (an `iframe` without `src`, before it loads anything). A script in the page cannot close this. A page can reach such a frame through `window[0]` or `window.frames`, which a script cannot intercept. So a page written to get around the script can still reach WebKit's geolocation in two ways:

1. **The empty frame's own geolocation:** `iframe.contentWindow.navigator.geolocation`.
2. **The empty frame's getter, from another realm:** `iframe.contentWindow.Navigator.prototype`'s `geolocation` getter, called with `.call(navigator)` on the page's own navigator. WebKit's getter answers for any navigator, whichever realm it came from. A frame that loads a document runs the script, so its getter refuses; `WebLocationTests` covers both cases.

Only pages of a sign-in flow can reach these limits, as the app opens no other page of another origin. The shell keeps such a page, in the main frame or a frame, only while a sign-in is under way; every other address opens in the browser. The first-run sign-in sheet shows the address the person typed when it answers with a login page or another web page and they choose to sign in there; it also shows the pages that sign-in goes through. The background run's page is the server's own, which also refuses there; its code is the server's, and the server is trusted. Once the app has location permission, iOS does not ask again. Whether WebKit then shows its own question naming the page's host is left to a device check (task 3.2). The script refuses ordinary requests from other origins. It is not a guarantee against a page written to get around it.

WebKit gives a position only to a secure page (https or localhost), so a server on plain http gets none, as in Safari.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: "Position for the web app" covers the iPhone app too.

## Impact

`mobile/ios`: `WebLocation.swift` (new), the shell, the first-run sign-in sheet and the background run install its script; `Info.plist`, `project.yml` and `InfoPlist.xcstrings` gain the usage description. No server, web or synced-data change: the position goes only to the page, which writes it as an ordinary location edit.
