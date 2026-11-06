# Design: cookie writes need an Origin

## Context

`requireAuth` runs `originAllowed` on every cookie-authenticated write. `originAllowed` returns true for a request without `Origin`, on the reasoning that browsers send it on writes and non-browser clients do not. The gap is a browser that sends neither `Origin` nor honours `SameSite`.

## Decisions

### D1 — Fetch Metadata first, then the content type

Without `Origin`:

1. `Sec-Fetch-Site` present: only `same-origin` passes. A browser that sends it says where the request came from; `same-site`, `cross-site` and `none` (a navigation the person started elsewhere, such as a bookmark or another app) are not the app's own pages.
2. Neither header: only a request declaring `Content-Type: application/json` passes.

What a cross-site page can make a browser send without a CORS preflight is a form submission or a navigation: `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`, and no `PUT`, `PATCH` or `DELETE`. A JSON content type from another origin needs a preflight, which this server never answers with CORS permission. So the JSON rule refuses everything such a browser could forge, and keeps clients that are not browsers working.

### D2 — Why not refuse every write without both headers

The task list asked to refuse writes with neither header. `ot login` (every released version) signs in with a password and creates its API token with `POST /api/v1/tokens`, the session cookie, a JSON body and no `Origin`; `docs/api.md` documents the same flow for other scripts, and `docs/stability.md` promises that earlier clients keep working. Refusing them would break sign-in for every installed `ot` until it is upgraded, without closing anything the content-type rule leaves open. The stricter rule remains possible later, after `ot` sends `Origin`, if a reason appears.

### D3 — Clients checked

- Browsers: Chrome, Edge, Firefox and Safari send `Origin` on every non-`GET` fetch; Safari before 16.4 sends no `Sec-Fetch-Site`, which does not matter when `Origin` is there.
- Android shell (`mobile/android`): the app runs in a Chromium WebView and its writes are the page's `fetch` calls. Native code (`HealthCheck`, `ShellCache`) sends only `GET` requests with the cookie.
- iOS shell (`mobile/ios`): WKWebView, the same; native `HealthCheck` is a `GET`.
- Service worker (`web/public/push-sw.js`): its `POST /api/v1/sync` is a same-origin fetch with `credentials: 'same-origin'`, which carries `Origin` and `Sec-Fetch-Site: same-origin` (the server's `Referrer-Policy: same-origin` keeps `Origin` from becoming `null`).
- Share target: `POST /share` is a public route that only redirects into the app; the cookie check does not run there (its Fetch Metadata check is a separate change).
- Tokens and app passwords (extension, Obsidian plugin, `ot` after login, CalDAV, MCP): not affected.

### D4 — Tests send what browsers send

The package's tests build many clients by hand, including uploads with multipart bodies. A test-only `http.DefaultTransport` wrapper adds `Sec-Fetch-Site: same-origin` to a request that names neither header, as a browser on the app's pages would, unless the test sets the `X-Test-No-Fetch-Metadata` marker to send a bare request. Cross-site tests set `Origin` themselves and are left alone.

## Risks / Trade-offs

- A JSON write from a browser too old for Fetch Metadata and `Origin` is accepted, as before; reaching it from another site needs a CORS preflight that fails.
- A script that posts form data with a session cookie and no `Origin` is now refused; API tokens are the documented way for scripts.

## Data model, size

No data or op change, no dependency, no client change.
