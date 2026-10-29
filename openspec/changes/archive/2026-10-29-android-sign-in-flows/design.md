# Design

## Context

`MainActivity.shouldOverrideUrlLoading` kept the server's origin in the web view and handed everything else to the system browser (native-shells D5). That is right for links and wrong for sign-in: a login wall and OpenTodo's own single sign-on both move the main frame to another origin with an HTTP redirect, and the session that results has to end up in the web view's cookie jar.

## Decisions

### D1. A sign-in flow starts only with a redirect away from the server

`SignInFlow` (pure Kotlin, unit tested) decides every main-frame navigation:

- **The server's origin** always stays, and ends any flow.
- **A flow starts** when a navigation is an HTTP redirect (`WebResourceRequest.isRedirect`) and the page it started from, or the hop it redirects, is on the server's origin. OpenTodo itself never redirects away for anything but single sign-on, so a redirect away from the server's origin is a login wall or the SSO start route. A loaded page of the server navigating away by a link or a script does not start one, so `BridgeTest.linksToOtherSitesOpenTheSystemBrowser` and every link in the app keep opening the browser.
- **While a flow is active**, these stay: any redirect (a wall chaining to an upstream provider), any navigation to an origin the flow already visited (the provider's own pages and form posts), and any navigation without a user gesture (a provider's script or auto-submitted form). A link the person taps to an origin the flow has not visited (a provider's privacy page) opens in the browser.
- **A flow ends** on reaching the server's origin, or when the person leaves it (site bar close, back). **15 minutes** after its last navigation it stops leading anywhere new: navigations between the origins it already visited still stay (a password form sent late still works, and the way back to the server always does), but a redirect or script navigation to a new origin no longer does. Fifteen minutes fits typing a password, a second factor and an email code.
- **No blank screen, no browser for a refused redirect.** A main-frame redirect the rule refuses is never handed to the browser (the session would land there, which is issue #471's symptom). The app shows an error, "signing in didn't continue in the app", with **Sign in here**, which ends the flow and loads the server's address so the wall starts a fresh one. This covers the tester's setup too: with `/healthz` and `/api/*` bypassed the first-run check passes, and the app's first page meets the wall, whose redirect starts a flow like any other (`SignInFlowsTest.healthBypassedButThePageBehindTheWall`).
- **Not main frame:** sub-frame navigations keep the old rule (the server's origin stays, others open outside); WebView does not ask about ordinary http sub-frames anyway.

Rejected: "any navigation without a user gesture from the server's origin". `hasGesture` is false for script-driven clicks, which would keep ordinary links in the app; and the server never needs it.

### D2. The site bar and the way out

A thin bar above the web view shows "Signing in on <host>" while the main frame is on another origin, with a close button labelled "Back to OpenTodo". Close and system back on such a page end the flow and load the server's start page; its wall may then ask again, which is what the person expects. The bar is one row of chrome only while a foreign page shows, never over the web app itself (interface budget unaffected).

### D3. The bridge stays on the server's origin

`Bridge.install` already registers the web message listener and the document-start script with the server's origin as the only allowed origin rule, and checks the source origin of every message; nothing changes there. The one native script injected without that rule, the share hand-over on `/share`, now also checks the page's origin, since a foreign page can now fill the web view.

### D4. First run behind a wall

`HealthCheck` keeps not following redirects and now sends `Accept: application/json, text/html;q=0.5` (Authelia and others answer a client that takes no page with a bare 401) and the web view's cookies for the server. New outcomes:

- `LOGIN_WALL`: a 3xx to anything but a `/healthz` (another host's sign-in page, or `/oauth2/sign_in` on the same host), or a 401/403 with an HTML page. A 3xx to `/healthz` elsewhere (http to https, another host) stays `NOT_OPENTODO`.
- `WEB_PAGE`: 200 with HTML instead of the health answer. It may be a wall's page or simply another site, so the message says both and offers the sign-in.

**Sign in here** opens `SignInActivity`: the server's address in a web view with the same `SignInFlow`, the site bar always shown, no bridge. Each time a page of the server finishes loading it flushes cookies and runs the health check with them; when it passes, the screen closes with OK and the first-run screen checks again and saves the server. Close or back cancels.

### D5. Cookies and the hidden run

The web view's `CookieManager` is shared by both activities and the hidden run. It is flushed on `onPause` and when a page of the server finishes, so a wall's cookie survives the app being killed. The hidden run keeps refusing every navigation off the server's origin (`SignInFlow.hiddenRunStays`) and has no host to open a browser: with an expired wall session it loads nothing and ends after its 30 seconds; the next time the app is opened, the wall asks inside the app.

### D6. Providers that refuse web views

Google (and some others) reject sign-in in an embedded web view with `disallowed_useragent`. The app does not hide that it is a web view. The full fix is Custom Tabs plus a one-time code the server hands back through an app link, which needs a server route, an app link and a verified domain per self-hosted server: a follow-up, not this change. The docs name the fallback: a password or passkey for OpenTodo's own SSO, or a bypass of the app's paths at the wall.

## Data model

None: no op, field, route or setting.

## Size and memory

One small activity, one class, two layouts and a vector icon: a few KB in the APK. No dependency.
