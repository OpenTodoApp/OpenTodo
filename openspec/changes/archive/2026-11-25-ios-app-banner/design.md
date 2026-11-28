# Design

## D1. Smart App Banner, not universal links

Universal links need `applinks:<domain>` in the app's signed entitlement. The domain is fixed at build time and must serve `apple-app-site-association`, fetched through Apple's CDN. `*.` only matches subdomains of one listed domain, and `mode=managed` only works on MDM-managed devices. Every self-hosted server has its own domain, so none of these covers it.

A Smart App Banner is a tag in the page. Safari draws it and shows **Open** when the app is installed. It costs the user one more tap than a universal link, and Safari keeps it hidden on that site once the user closes it. It needs no Apple account change and no new domain.

## D2. Only `/task/<id>`

`/task/<id>` is the only address OpenTodo writes into other apps: the calendar feed's `URL` (`calfeed.TaskURL`) and the event bodies of calendar sync. It is also the only page the app opens by id (`show(task:)`). Other pages get no banner, so the banner does not show on every page a person visits in Safari. Task pages under `/t/` are public pages, not the app, and get none either. The path is read as the request carries it, decoded: a trailing slash (`/task/abc/`), an id holding a `/` (an escaped `%2F` too) or a deeper path gets no banner, on the server, in the worker and in the app alike.

## D3. The argument is the page's own address

`app-argument` is `<origin>/task/<escaped id>`. The id is escaped to unreserved characters only (`A-Z a-z 0-9 - . _ ~`), so no comma ends the argument (Safari reads the content attribute as a comma-separated list) and no quote or angle bracket leaves the attribute. The server HTML-escapes the content as well. This is the address the calendar holds, so the app can check its host (D5).

The server names the origin of `OPENTODO_BASE_URL` (`cfg.Origin()`). Without a base URL the server cannot tell its public address, so its banner carries no argument and opens the app at its start. The worker names its own origin (D4). One set of vectors, `web/src/lib/appBanner.vectors.json`, is read by the Go and the TypeScript tests, so both copies carry the same tag for the same address.

The tag is a `<meta name>`, which the Content-Security-Policy does not govern. The page's policy is unchanged, and no script or style is added.

## D4. The service worker adds it too

A Safari that has run the web app answers navigations from the service worker's cached `index.html`, the exact bytes of the signed list (signed-web-app D7), so it would never see the server's copy. The worker adds the tag to a `/task/<id>` navigation after it has read and checked the cached page. The worker's copy names the page's own origin, which is the base URL's origin whenever the person opened the address the calendar holds, and it carries an argument even where the server's copy has none. The response keeps the page's headers and the worker's CSP, without the cached file's Content-Length. `signed-web-app` D7 names this as the one addition to the signed page. The cached file and the signed list are untouched. The tag comes from the worker's own code and the address, never from the network.

## D5. The app opens its own server's links only

Safari hands `app-argument` to the app through `openURL` (SwiftUI `onOpenURL`), the path `opentodo://` links already take. `AppModel.handle(url:)` gains one check before its `opentodo` guard: an `http(s)` address whose scheme, host and port are the configured server's, with the path `/task/<id>`, opens that task through `show(task:)`. Any other host, or any other path, is ignored, as any web link is today. Should iOS hand the address over as a browsing activity (`NSUserActivityTypeBrowsingWeb`) instead, `onContinueUserActivity` passes its `webpageURL` to the same `handle(url:)`. The check is a static function, so it is tested without the app's state.

## Data model, size and privacy

- No op field, route, setting or environment variable.
- The page grows by about 110 bytes, and the worker by a few hundred bytes. The image size and memory are unchanged.
- The server makes no request. Safari asks Apple's App Store about the app id itself, as it does for any site with a banner. That request comes from the user's browser, not the server, and carries no OpenTodo data.
