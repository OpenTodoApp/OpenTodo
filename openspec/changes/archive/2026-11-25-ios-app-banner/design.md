# Design

## D1. Smart App Banner, not universal links

Universal links need `applinks:<domain>` in the app's signed entitlement. The domain is fixed at build time and must serve `apple-app-site-association`, fetched through Apple's CDN. `*.` only matches subdomains of one listed domain, and `mode=managed` only works on MDM-managed devices. Every self-hosted server has its own domain, so none of these covers it.

A Smart App Banner is a tag in the page. Safari draws it and shows **Open** when the app is installed. It costs the user one more tap than a universal link, and Safari keeps it hidden on that site once the user closes it. It needs no Apple account change and no new domain.

## D2. Only `/task/<id>`

`/task/<id>` is the only address OpenTodo writes into other apps: the calendar feed's `URL` (`calfeed.TaskURL`) and the event bodies of calendar sync. It is also the only page the app opens by id (`show(task:)`). Other pages get no banner, so the banner does not show on every page a person visits in Safari. Task pages under `/t/` are public pages, not the app, and get none either.

## D3. The argument is the page's own address

`app-argument` is `<base URL>/task/<escaped id>`. The id is one escaped path segment, with commas escaped too, because Safari reads the content attribute as a comma-separated list. The whole content is HTML-escaped. This is the same address the calendar holds, so the app can check its host (D5). Without `OPENTODO_BASE_URL` the server cannot tell its public address, so the banner carries no argument and opens the app at its start.

The tag is a `<meta name>`, which the Content-Security-Policy does not govern. The page's policy is unchanged, and no script or style is added.

## D4. The service worker adds it too

A Safari that has run the web app answers navigations from the service worker's cached `index.html`, the exact bytes of the signed list (signed-web-app D7), so it would never see the server's copy. The worker adds the same tag to a `/task/<id>` navigation after it has read and checked the cached page, using its own origin. The cached file and the signed list are untouched. The tag comes from the worker's own code and the address, never from the network.

## D5. The app opens its own server's links only

Safari hands `app-argument` to the app through `openURL` (SwiftUI `onOpenURL`), the path `opentodo://` links already take. `AppModel.handle(url:)` gains one check before its `opentodo` guard: an `http(s)` address whose scheme, host and port are the configured server's, with the path `/task/<id>`, opens that task through `show(task:)`. Any other host, or any other path, is ignored, as any web link is today. The check is a static function, so it is tested without the app's state.

## Data model, size and privacy

- No op field, route, setting or environment variable.
- The page grows by about 110 bytes, and the worker by a few hundred bytes. The image size and memory are unchanged.
- The server makes no request. Safari asks Apple's App Store about the app id itself, as it does for any site with a banner. That request comes from the user's browser, not the server, and carries no OpenTodo data.
