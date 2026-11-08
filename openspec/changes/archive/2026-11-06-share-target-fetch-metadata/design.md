# Design: the share target needs Sec-Fetch-Site

## Context

`sw.ts` answers `POST /share` (the manifest's `share_target`, `multipart/form-data`) by storing the form in the share inbox (IndexedDB) and redirecting to `/share?inbox=<id>`, where the capture screen shows it until the person saves or cancels. `shareRequestAllowed` decided from the headers alone: `Sec-Fetch-Site` `none` or `same-origin`, or no header at all.

## Decisions

### D1 — No header, no store

A share sheet's `POST` with files needs a share target that accepts files, which Chrome supports from version 76 on Android and 89 on desktop; Chrome sends Fetch Metadata headers from version 76 (Edge from 79). Safari and Firefox do not register web apps as share targets at all (`docs/capture.md`). So a real share sheet request always has `Sec-Fetch-Site: none`, and the app's own pages send `same-origin`. A `POST` without the header can only come from a browser that predates Fetch Metadata, where nothing tells the service worker which site sent it. It is no longer stored.

`shareRequestVerdict(headers)` returns `store`, `refused` (another site, an unknown value, or a declared size over 100 MB) or `unverified` (no header). `shareRequestAllowed` stays as `verdict === 'store'`.

### D2 — Say why, instead of a silent redirect

A refused cross-site form keeps going to `/`, as before: the person did not try to share anything. For `unverified` the service worker redirects to `/share?files=unverified`, a new value of the capture screen's existing `files` mode (beside `1`, `denied` and `lost`), and the screen shows one note under its usual "Nothing was shared" line. Nothing from the request reaches the screen: the body is never read.

### D3 — Native shells and the server fallback

The Android and iOS shells open `/share?title=…&text=…&url=…[&files=1]` with a `GET` and post files as the `opentodo-files` message (`mobile/README.md`), so they never reach this check. The server's fallback for a `POST /share` that arrives before the service worker is active stores nothing and moves only text into the capture screen's address, which a plain link can do too; it is left as it is.

## Data model

None.

## Size

One message in each catalogue and a few bytes of code in the capture screen (loaded with it) and the service worker. No dependency.

## Interface budget

The capture screen gains no chrome: one more possible note in the existing notes block, shown only for this case.

## Risks

- A Chromium-based browser that supports share targets but strips Fetch Metadata headers (none known) would show the note instead of the share. The note says what to do.
