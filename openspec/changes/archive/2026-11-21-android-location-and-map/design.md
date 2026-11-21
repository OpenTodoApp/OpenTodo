# Design

## D1: The page's position goes through the location prompt the shell already has

`WebChromeClient.onGeolocationPermissionsShowPrompt` is answered through `requestLocationPermission`, the fine-and-coarse request location reminders use, so the person sees one Android prompt and either choice (precise or approximate) lets the page have a position. A second request while the prompt is up waits for the same answer instead of replacing the first one, which would leave a page or the reminders setting waiting forever. The decision of who may ask is `WebLocation.allowed(play, server, origin)`: pure, unit-tested, origin compared after the same normalisation as the sign-in flow. `retain` is always false, so a later refusal in Android's settings holds and the web view asks the shell every time.

## D2: `geo:` joins the existing external-link rule

Both ways a link leaves the shell (the bridge's `openExternal`, which the web app's link handler calls for `target=_blank`, and a navigation the web view refuses) already go through `Bridge.safeExternal` and `MainActivity.openExternal`. `geo:` is added there, not as a second path, and only in the strict shape `web/src/lib/locations.ts` writes, with coordinates in range: a `geo:` query with a free-text search or extra parameters is refused. When no app opens it, `WebLocation.fallback` turns the point into the openstreetmap.org link the web app uses on a computer.

## Data model, size

No data model change. A few hundred bytes of code; no dependency, no image or memory effect.
