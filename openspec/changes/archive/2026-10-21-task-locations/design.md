## Context

See proposal.md for the motivation. Relevant current state:

- Tasks already carry one whole-value object field, `origin` (task-origin), validated on the sync and API write paths, encrypted whole for E2EE accounts, and shown on the task panel's Where line (task-panel-facets). `location` follows the same pattern.
- The panel shows properties as four facet lines (Where, When, How, Who) with popover editors (`FacetEditor`); a location fits the Where line without a new row.
- The sidebar's More group already lists secondary destinations per "How you work" mode (app-shell "Sidebar structure"); `quiet-sidebar` and `sidebar-favourites` both modify that requirement and are not archived yet.
- `internal/httpapi/middleware.go` sends `Permissions-Policy: camera=(), geolocation=()` and a CSP with `connect-src 'self'`, `img-src 'self' data: blob:`, `worker-src 'self'`.
- Outbound requests to user-typed addresses go through `internal/outbound` (no private networks, pinned connection, no redirects). Map providers are owner-configured, not user-typed, but the same client gives timeouts and no redirects for free.
- AGENTS.md non-negotiable #5 and the `self-hosting` "No telemetry" requirement forbid third-party calls except to configured destinations. The user decided maps are on by default; this change rewrites the rule rather than working around it.

## Goals / Non-Goals

**Goals:**
- A location on any task, set in five ways, usable fully offline once set.
- Reusable places with live links from tasks.
- Maps that are on by default yet never let the viewer's browser talk to a third party, and that cost nothing when turned off.
- E2EE accounts keep stored locations unreadable to the server.

**Non-Goals:**
- Location reminders (geofencing needs background location on phones; a later change).
- Showing locations on task rows or board cards (the row metadata requirement is being reshaped by `calm-rows`; a later change can add a place chip once that settles).
- Offline map tiles, routing, distance filters, quick-add location tokens, CalDAV `LOCATION`/`GEO`, CLI and MCP support (follow-ups; CalDAV's `LOCATION` is a natural first one).

## Decisions

**D1. Data model.** Task: additive `location` field, whole-value LWW register, `null` by default; object `{name?, address?, lat?, lon?, place_id?}` or an E2EE ciphertext string. Place: new entity `place` with `name`, `address`, `lat`, `lon`, `position`, `created_at`, `deleted_at` (tombstone), private to the user (personal scope only; places in shared projects are a non-goal: a shared task's location is a plain value without `place_id`, or with a `place_id` other members cannot resolve, in which case they see the stored members). Additions in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`, export and import, `internal/e2ee.ContentFields` and `CONTENT_FIELDS` (task `location` as a whole value; place `name`, `address`, `lat`, `lon`). No op field is renamed; no migration of existing rows (new columns or a new table via an additive migration). Alternative: storing only `place_id` on tasks and forcing every location to be a place. Rejected: one-off locations ("the parcel locker on Via Verdi") should not clutter Places.

**D2. Linked places with a snapshot.** Choosing a place writes the place's current members plus `place_id`. Display prefers the live place; when it is deleted, unknown or encrypted-and-locked, the snapshot shows. Renaming a place therefore needs no write to its tasks, and a deleted place never leaves a task blank.

**D3. Providers.** Tiles: OpenFreeMap (OpenStreetMap data, vector tiles, no API key, no usage limits, donation funded, open-source infrastructure). Alternatives: tile.openstreetmap.org raster tiles (its usage policy discourages app use at scale and forbids heavy use), Protomaps (great, but its free hosted API needs a key), commercial providers (rejected by principle). Search: Photon (open source, OpenStreetMap data, supports search as you type and reverse search). Alternative: the public Nominatim server, whose usage policy forbids autocomplete and allows one request per second per application. Both providers are configurable: an owner can self-host Photon or point tiles at their own OpenFreeMap or Protomaps instance.

**D4. Everything through the server.** The browser asks `/api/v1/maps/style`, `/api/v1/maps/tiles/{z}/{x}/{y}.pbf`, `/api/v1/maps/fonts/...`, `/api/v1/maps/sprites/...`, `/api/v1/maps/search?q=` and `/api/v1/maps/reverse?lat=&lon=`. The server rewrites the provider's style so every URL in it points back to these routes, fetches upstream with an identifying User-Agent (`OpenTodo/<version> (+https://open-todo.app)`) and no cookies or client headers, and caches tiles, fonts and sprites on disk (`<data>/cache/maps`, LRU with a default 200 MB cap, honouring the provider's cache lifetimes). Searches are not cached and are rate limited per user (default 30 per minute). Routes are registered with `signedIn` (session or full token) and `.demoDenied()`, plus the matching `demo.go` entry. Why: hides the viewer's IP from the provider, keeps CSP `connect-src 'self'` and `img-src 'self'` unchanged, lets one cache serve a household, and gives the owner one switch. Alternative: browser fetching tiles directly. Rejected: it exposes every viewer's address and needs CSP exceptions per provider.

**D5. Map library.** MapLibre GL JS (BSD-3), loaded with a dynamic `import()` only by the map component, so the main bundle does not change. Its worker is served from the app's own origin (configured worker URL), keeping `worker-src 'self'`; no `blob:` worker is needed. Alternative: Leaflet with raster tiles (smaller, about 40 KB gzipped) but OpenFreeMap serves vector tiles; raster would need a second provider. Size: about 230 KB gzipped (about 800 KB raw) as a lazy chunk; the embedded web build in the binary and image grows by about 0.8 MB. Runtime memory on the server: the proxy streams responses and holds no tiles in memory beyond a buffer; the disk cache is capped. In the browser, a WebGL map costs memory only while a map is on screen. Devices without WebGL get the no-map presentation (name, address, coordinates, "Open in maps").

**D6. Switches.** Owner settings `maps.enabled` (default true), `maps.tiles_url`, `maps.geocoder_url` in owner settings; env overrides `OPENTODO_MAPS`, `OPENTODO_MAPS_TILES_URL`, `OPENTODO_MAPS_GEOCODER_URL`, all optional, validated at startup. The profile tells clients whether maps are available. User preference `user_prefs.maps` (`on`/`off`, default on), additive and synced. Demo: off unless `OPENTODO_MAPS=on`.

**D7. Interface budget.** No new chrome row: the location is a part of the existing Where line, and the map sits under the facet lines inside the panel's single scroller (no new scroll region). Default visible task properties unchanged: a task without a location shows nothing new, and rows show no location. Sidebar primary destinations unchanged: Places is in the More group in every mode. Shortcuts: no new default key; "Go to Places" and "Set location" are command palette commands registered in the shortcut registry without keys, so nothing can conflict. The Places page uses the standard page template (one header row).

**D8. Geolocation.** `Permissions-Policy` becomes `camera=(), geolocation=(self)`. The browser prompts; a refusal is reported in the editor and nothing is written. Positions are rounded to 6 decimals (about 10 cm) before storing.

**D9. Rewording the principle.** AGENTS.md non-negotiable #5 becomes:

> **No telemetry, no third-party network calls by default except maps, no new mandatory env vars.** Outbound requests go only to targets the operator or a user configured (webhooks, backup destinations, push services, the OIDC issuer, the SMTP server, the IMAP mailbox, assistant model providers, calendar subscriptions, issue connection hosts), and, while maps are on, to the map provider: OpenStreetMap-based by default (OpenFreeMap tiles, Photon search), changeable or turned off by the owner, always through the server's map proxy with no account data. Addresses a person typed go through `internal/outbound`.

The `openspec/config.yaml` context line "no telemetry, no phone-home" becomes "no telemetry, no phone-home; the only default outbound destination is the map provider, which the owner can change or turn off". ROADMAP.md's "Principles that do not change" keeps "No telemetry" and gains the same clarification.

**D10. Spec placement.** E2EE behaviour is an ADDED requirement ("Encrypted locations and places") rather than a change to "Encrypted and plaintext fields", which `close-the-day` and `time-tracking` already modify; the Places sidebar entry is stated in `task-locations` rather than in app-shell "Sidebar structure", which `quiet-sidebar` and `sidebar-favourites` modify. When those changes archive, a follow-up edit adds Places to the More list in "Sidebar structure" (task 7.4).

## Implementation notes

Recorded while implementing; they adjust the decisions above.

- **Coordinates of a place are one value, `geo: {lat, lon}`** (not `lat` and `lon` fields). The web client encrypts strings and whole objects; a pair of numbers as one object is encrypted whole like `task.location`, so an encrypted account's place position stays unreadable to the server (D1).
- **No migration.** Entities and fields are materialized generically from the op log (`scope_fields`), so the schema entries are all the server needs; old rows read `location: null` from the client defaults (task 1.2).
- **"Locations" in the interface.** Open Loops already names its seven task homes "Places" (docs/method/places.md) and has a "Place" move. To avoid two meanings, the page, the sidebar entry and the commands say **Locations** / **saved locations** ("Save for reuse"), the user's own word for them; the entity and the code stay `place`, and the routes are `/locations` and `/location/<id>`. The specs keep their requirement names and use the new words in their text.
- **Demo instances.** The map routes are not on the demo deny list: a demo's maps are off through the switch's default, and `OPENTODO_MAPS=on` really turns them on there as "Map switches" says. The settings route follows the deny list's "Server settings" rule (writes refused) (D4).
- **Map library.** MapLibre GL 6.12.0 (exact version, released 2026-10-03). Its ES module worker is built by Vite as a same-origin file (`?worker&url`) and handed to `setWorkerUrl`, so `worker-src 'self'` holds with no blob worker. Measured: the lazy map chunk is 1,038 KB raw / 281 KB gzipped plus 83 KB of CSS (11 KB gzipped), the worker 510 KB raw / 145 KB gzipped; the main bundle grows from 321.0 to 323.4 KB gzipped (the editor, the Locations page and the data layer). The map chunks are left out of the service worker's precache, so a device that never shows a map never downloads them. The embedded web app, and so the binary, grows by about 1.6 MB raw (D5, task 4.6).
- **Palette commands, no registry entries.** "Go to Locations" and "Set the location of …" are command palette entries without keys; the shortcut registry lists keyed shortcuts only, so nothing can conflict (task 3.4).

## Risks / Trade-offs

- [The public Photon instance is fair-use and may throttle or disappear] → the geocoder URL is configurable, errors degrade to coordinates and places, and the self-hosting guide shows how to run Photon next to OpenTodo.
- [OpenFreeMap is donation funded] → tile URL configurable; cache reduces load; attribution and a link to support it in the guide.
- [Default-on outbound traffic surprises privacy-minded operators] → one switch and one variable to turn it off, a line on the Server page naming what is sent, the self-hosting guide, and the CHANGELOG upgrade note.
- [Bundle growth] → lazy chunk only; main bundle budget unchanged; measured in task 4.6.
- [Disk use of the tile cache] → capped, under the data directory, excluded from backups.
- [Stale linked place on a locked E2EE device] → snapshot shown, marked "Encrypted" where the place cannot be read.

## Migration Plan

Additive migration for the `location` column and the `places` table; old clients ignore both. Upgrade notes: maps are on by default and make outbound requests to OpenFreeMap and Photon through the server; set `OPENTODO_MAPS=off` to keep the previous behaviour. Rollback: older servers ignore the new fields; the cache directory can be deleted.

## Open Questions

- Default tile cache cap (200 MB proposed) and search rate (30 per minute per user) can be tuned after measuring a household's real use without changing the specs.
