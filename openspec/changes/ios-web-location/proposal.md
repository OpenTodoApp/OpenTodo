# Proposal

## Why

"Use my location" in a task's location editor works in the Android app, which answers the page's request for the position (requirement "Position for the web app"). The iPhone app declares no location permission, so WebKit never gets a position and the editor says the browser did not share it. The owner asked for the iPhone app to do what the Android app does, for the server's own pages only.

## What Changes

- **The iPhone app declares `NSLocationWhenInUseUsageDescription`**, translated like its other usage descriptions. With it, WebKit answers a page's `navigator.geolocation` request and iOS asks once for the app's location while in use.
- **Other origins are turned away.** WebKit gives an app no per-origin answer for the position, so a script runs at the start of every frame, before the page's own scripts. On any page other than the configured server's (a sign-in provider, a frame it embeds, a look-alike host, another port or scheme), it replaces `navigator.geolocation` with one that refuses at once with `PERMISSION_DENIED`, without a prompt. The first-run sign-in sheet and the background run refuse every page.
- **Tests:** `WebLocationTests` run the script in JavaScriptCore for the server's page, other origins, and no server.

Known limit, for the security read: WebKit does not run an app's scripts in a frame's first empty document (an `iframe` without `src`). So a page of another origin can create one and reach the geolocation the script took away. It can take that frame's `navigator.geolocation`, or that frame's `Navigator.prototype` getter called on its own `navigator`. Once the app has location permission, iOS does not ask again. Whether WebKit then shows its own question naming the page's host has to be checked on a device. The script refuses other origins' ordinary requests, and the server's own pages are the only ones the app opens outside a sign-in. It is not a guarantee against a page written to get around it. WebKit gives a position only to a secure page (https or localhost), so a server on plain http gets none, as in Safari.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: "Position for the web app" covers the iPhone app too.

## Impact

`mobile/ios`: `WebLocation.swift` (new), the shell, the first-run sign-in sheet and the background run install its script; `Info.plist`, `project.yml` and `InfoPlist.xcstrings` gain the usage description. No server, web or synced-data change: the position goes only to the page, which writes it as an ordinary location edit.
