## Why

Many tasks happen somewhere: pick up the parcel at the post office, check the boiler at mum's, meet the plumber at the flat. Today the place lives in the title or the notes, with no way to see it on a map, reuse it, or find every task for one place. Commercial apps answer this with location fields and maps from commercial providers; OpenTodo can do it with an open, non-commercial stack (OpenStreetMap) and without handing the viewer's address book to a third party.

## What Changes

- **Task location.** A task gains an optional `location`: a name, an address and coordinates, set by searching an address, typing coordinates, picking a point on a map, using the browser's current position, or choosing a saved place. It syncs as one whole value, works offline, and is shown on the panel's Where line with a small map.
- **Places.** A new synced entity for common locations (Home, Office, Mum's, the gym), managed on a Places page reachable from the sidebar's More group, with each place's open tasks and a map of all places. Choosing a place for a task links it, so renaming or moving the place updates its tasks.
- **Maps, on by default, can be turned off.** Map tiles from OpenFreeMap (OpenStreetMap data, no key, non-commercial), address search through Photon (OpenStreetMap-based, allows search as you type), the map library loaded only where a map is shown. Every request goes through the OpenTodo server, which hides the viewer's address, caches tiles and keeps the page's Content-Security-Policy to its own origin. The owner can turn maps off for the server or point them at other providers; each user can turn maps off for themselves; the demo instance has them off. Without maps a location still works: name, address, coordinates and an "Open in maps" link to the user's own maps app.
- **Encryption.** For an end-to-end encrypted account a task's location and a place's name and position are encrypted on the device; only an address search leaves the device, through the server, and the search field says so.
- **Geolocation allowed for the app itself.** The `Permissions-Policy` header today forbids geolocation; it allows it for the app's own origin, and the browser still asks the user.
- **A principle changes (not BREAKING in the op-log or env-var sense).** "No third-party network calls" becomes "no third-party network calls except the map provider, which is OpenStreetMap-based by default and can be changed or turned off by the owner". `AGENTS.md` non-negotiable #5, the `self-hosting` "No telemetry" requirement and the project context in `openspec/config.yaml` ("no phone-home") are reworded accordingly. Map requests carry no usage data and no account information.
- No new mandatory environment variable: `OPENTODO_MAPS`, `OPENTODO_MAPS_TILES_URL` and `OPENTODO_MAPS_GEOCODER_URL` are optional overrides. The op log is additive only (new `location` task field, new `place` entity).

Out of scope: location-based reminders ("remind me when I arrive"), a location token in quick add, filters by distance ("near home"), locations on task rows and cards, routing or directions, offline map tiles, and locations in CalDAV, the CLI and the MCP tools (each a follow-up). ROADMAP.md has no item for this yet; the change adds one under "Next: Parity and depth" when it ships.

## Capabilities

### New Capabilities
- `task-locations`: the task location field and its validation, places, the Places page and its sidebar entry, maps and address search through the server's map proxy, the owner and user switches, behaviour without maps, demo behaviour, and the privacy promises.

### Modified Capabilities
- `self-hosting`: "No telemetry" allows the map provider as the one default outbound destination the owner can change or turn off; "Security headers" allows geolocation for the app's own origin.
- `end-to-end-encryption`: a new requirement for encrypted locations and places (added, so the existing "Encrypted and plaintext fields" requirement other open changes modify is not touched).

## Impact

- Data: additive `location` on tasks, new `place` entity (sync schema, types, defaults, export and import, E2EE content fields).
- Server: map proxy routes (style, tiles, glyphs, sprites, search, reverse search) behind sign-in and the demo deny list, an on-disk tile cache under the data directory with a size cap, owner settings and `OPENTODO_MAPS*` overrides, the `Permissions-Policy` change.
- Web: location editor in the task panel (Where line), Places page and its route, a lazily loaded map component, user switch in Settings → General, owner card in Settings → Server.
- Dependency: MapLibre GL JS, loaded only on screens that show a map (not in the main bundle); sizes in design.md.
- Docs: a user guide page on locations and places, a self-hosting page on maps and providers, `AGENTS.md` rule #5 and `openspec/config.yaml` context reworded.
