# Design

## Context

What the app did before this change with `todo.example.com` (read from `ServerAddress.swift`, `HealthCheck.swift` and `AppModel.swift`):

1. `ServerAddress.parse` prefixes `https://` to any text without `://`. It never tries `http`.
2. `HealthCheck` asks `https://todo.example.com/api/v1/health`, then `/healthz`, on a session whose delegate refuses every redirect: a redirect is "not an OpenTodo server", never followed.
3. On success `AppModel.connect` stores the normalised origin (`https://todo.example.com`, scheme and host lowercased, the default port and a trailing slash or dot dropped), and the web view loads only that origin.

So there was never an http request or a redirect, only no sign of it on the screen. A typed `http://192.168.1.20:8080` was accepted with no warning at all, though `native-shells` asks for one.

## Decisions

**D1. Connect is a filled button enabled by the parse result.** `.borderedProminent` at the large size, in a row of its own without the Form's background. White on the accent fill is about 8.6:1, so it reads as active in light and dark mode; when disabled the system draws its own grey fill and VoiceOver says "dimmed". It is enabled whenever `ServerAddress.parse` is not `.invalid`: an `http` address to a public host is well-formed, and Connect then shows the https offer. Return in the field still runs the check, so an unusable address can still say why. Keeping the plain row and adding a dark-mode variant of the accent was rejected: a lighter accent behind the white text of the web app's and other filled buttons drops below 4.5:1.

**D2. The field shows the origin the app will use.** Leaving the field, Return and Connect replace the text with the parsed origin when it is usable, so `Todo.Example.com/` becomes `https://todo.example.com` before anything is sent. A fixed `https://` prefix outside the text field was rejected: an address pasted with its own scheme would show two, and an explicit `http://` would need a second control. The placeholder carries the scheme too.

**D3. The http warning is live.** While the parsed address is local `http`, the field's footer shows "This connection is not encrypted." with an open-lock symbol. Public `http` stays refused (`needsHttps`), so the warning only ever accompanies an address the app will open. A local address without a scheme is `https` like any other.

**D4. Unicode host names are converted by the app.** `URL(string:)` returns `nil` for a non-ASCII host on iOS 16 and converts it on iOS 17, so the result depended on the phone. `ServerAddress.asciiHost` converts each non-ASCII label with RFC 3492 Punycode (about 50 lines, pinned by the RFC's own examples in the tests) after NFC and lowercasing; ASCII input is untouched. Android's `java.net.URI` refuses such hosts; that stays out of scope.

**D5. The address after connecting is the page's origin.** The shell only ever loads its configured origin, so `location.origin` in the web app is exactly that address. Settings → About shows it as the description of the existing shell row; no bridge member is added.

## Interface budget

One optional line on the first-run screen (the warning) and one line of description on an existing Settings row. No new chrome above a list, no shortcut.

## Impact

No data model, op, server or dependency change. App size: a few hundred bytes of code and one catalogue string.
