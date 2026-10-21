## Purpose

Lets a task say where it happens, lets a user keep the places they use often, and shows them on maps built on OpenStreetMap that the owner and each user can turn off, without exposing the viewer to the map provider.

## ADDED Requirements

### Requirement: Task location
A task SHALL have an optional `location`, one value `{name?, address?, lat?, lon?, place_id?}`, defaulting to none. It SHALL be stored, synced and converge by last-writer-wins as one whole value, like `due`: two devices that set it concurrently end with one of the two locations on every device, never a mix of members. It SHALL be set, changed and removed offline and survive edits to any other field. A location with a `place_id` SHALL show the place's current name, address and position while the place exists, and its own members otherwise.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** it has no location, and its export and API representation carry `location: null`

#### Scenario: Concurrent locations converge whole
- **WHEN** one offline device sets `{name: "Post office", lat: 45.46, lon: 9.19}` and another sets `{address: "Via Roma 1, Torino"}` on the same task, and both sync
- **THEN** every device shows the same one of the two locations, with all of its members from the same write

#### Scenario: Location survives other edits
- **WHEN** a task with a location is retitled on another device while this one is offline and gets a new due date here, then both sync
- **THEN** the task keeps its location and has the new title and the new date on every device

#### Scenario: Linked place follows the place
- **WHEN** a task's location is the place "Gym" and the user later moves the place's pin and renames it "Gym (new)"
- **THEN** the task shows "Gym (new)" at the new position on every device after sync, without a write to the task

#### Scenario: Place deleted
- **WHEN** a place linked from a task is deleted
- **THEN** the task keeps showing the name, address and position stored in its own location, and choosing "Unlink" or another place is possible

### Requirement: Location validation
The sync and API write paths SHALL accept a location only when it has at least one of `name`, `address` or a coordinate pair; `lat` is a number from -90 to 90 and `lon` from -180 to 180, both present or both absent; `name` is at most 200 and `address` at most 500 characters; `place_id` is an id; and no other member is present. An encrypted account's ciphertext string SHALL be accepted in place of the object, bounded only by the value limit. Anything else SHALL be refused as invalid and change nothing.

#### Scenario: Half a coordinate
- **WHEN** a client submits `location: {lat: 45.46}`
- **THEN** the write is rejected as invalid and the task's location is unchanged

#### Scenario: Out of range
- **WHEN** a client submits `location: {lat: 91, lon: 9}`
- **THEN** the write is rejected as invalid

#### Scenario: Empty or unknown member
- **WHEN** a client submits `location: {}` or `location: {name: "Home", zoom: 12}`
- **THEN** the write is rejected as invalid

#### Scenario: Cleared
- **WHEN** a client submits `location: null`
- **THEN** the location is removed and the task's other fields are untouched

### Requirement: Setting a location
The task panel SHALL show the location on its Where line and open an editor that offers: searching an address (as the user types, when maps are on), typing coordinates (`45.4642, 9.1900`), picking a point on a map (when maps are on), "Use my location" (the browser's position, after the browser's own permission prompt), choosing a saved place, "Save for reuse", and Clear. A chosen search result or map point SHALL fill the name and address from the provider's reverse search when maps are on. Every choice SHALL apply locally at once as one undoable edit. With a coordinate pair, the panel SHALL show a small map with a pin under the facet lines when maps are on, and an "Open in maps" link in every case.

#### Scenario: Search an address
- **WHEN** the user opens the location editor, types "Piazza del Duomo Milano" and picks the first result
- **THEN** the task's location has the result's name, address and coordinates, the Where line shows the name, and a small map with a pin appears in the panel

#### Scenario: Current position
- **WHEN** the user chooses "Use my location" and allows the browser's prompt
- **THEN** the location gets the device's coordinates and, with maps on, the nearest address as its address

#### Scenario: Permission refused
- **WHEN** the user chooses "Use my location" and refuses the browser's prompt
- **THEN** the editor says the browser did not share the position and nothing is written

#### Scenario: Offline
- **WHEN** the device is offline and the user types coordinates or chooses a saved place
- **THEN** the location is set at once and syncs later, while address search says it needs a connection

#### Scenario: Open in maps
- **WHEN** a task has a location with coordinates and the user activates "Open in maps"
- **THEN** a phone opens its maps app through a `geo:` link and a computer opens the position on openstreetmap.org in a new tab, both as a navigation the user chose

### Requirement: Places
A user SHALL be able to keep places: a `place` entity with `name` (required, at most 200 characters), `address` (at most 500), a coordinate pair stored as one `geo` value, `position`, `created_at` and `deleted_at`, private to the user. Places SHALL be created, edited, reordered and deleted offline as operations, converge per field by last-writer-wins, be deleted as tombstones, and be included in the export and restored by importing it. A place SHALL be created from the Locations page or with "Save for reuse" in a task's location editor.

#### Scenario: Save as a place
- **WHEN** a task's location is a searched address and the user chooses "Save for reuse" and names it "Mum's"
- **THEN** a place "Mum's" with that address and position exists on every device after sync, and the task's location links to it

#### Scenario: Concurrent edits to a place
- **WHEN** one device renames a place offline while another moves its pin, and both sync
- **THEN** the place has the new name and the new position on every device

#### Scenario: Export round trip
- **WHEN** the user exports and imports the export into a fresh account
- **THEN** the places and the tasks' links to them are restored

### Requirement: Places page
A Locations page SHALL list the user's places (shown as saved locations) in their order, each with its address and its number of open tasks, with a map showing every place that has coordinates when maps are on. Opening a place SHALL list its open tasks like any task list. The page SHALL be reachable at its own address, from the command palette, and from the sidebar's More group in every "How you work" mode; it SHALL never become a primary destination unless the user promotes it.

#### Scenario: Open a place
- **WHEN** the user opens Locations and selects "Office"
- **THEN** the open tasks whose location links to "Office" are listed, and they can be completed, opened and reordered like in any list

#### Scenario: Sidebar budget kept
- **WHEN** a user in Companion mode opens the sidebar
- **THEN** Locations is in the More group, and the primary destinations are unchanged

#### Scenario: Maps off
- **WHEN** maps are off for the user and they open Locations
- **THEN** the page lists the places with their addresses and counts, and shows no map and no request to a map route

### Requirement: Map proxy
The server SHALL serve maps through its own routes for the map style, tiles, fonts, sprites, address search and reverse search, each fetching from the configured provider, caching tiles on disk under the data directory within a size cap, sending an identifying User-Agent, and forwarding no cookie, account information or client address. Every map route SHALL require a signed-in session or a full token, SHALL be on the demo deny list, and SHALL answer 404 `maps_disabled` when maps are off for the server. Search SHALL be rate limited per user. The map SHALL show the provider's attribution.

#### Scenario: Signed-out request
- **WHEN** a request without credentials asks for a map tile
- **THEN** the response is 401 `unauthorized` and nothing is fetched from the provider

#### Scenario: Maps turned off by the owner
- **WHEN** the owner has turned maps off and a signed-in user's device asks for the style or a search
- **THEN** the response is 404 `maps_disabled`, and no request leaves the server

#### Scenario: Provider unreachable
- **WHEN** the tile provider does not answer within the timeout
- **THEN** the route answers 502 `maps_unavailable`, the panel shows the location without a map and keeps "Open in maps", and a tile already in the cache is still served

#### Scenario: Viewer's address hidden
- **WHEN** a user's browser loads a map and the provider's incoming request is inspected
- **THEN** it comes from the OpenTodo server's address, carries the server's User-Agent, and carries no cookie, token or user address

#### Scenario: Search rate limit
- **WHEN** one user sends more searches per minute than the limit
- **THEN** further searches answer 429 `rate_limited` until the minute passes, and other users are unaffected

### Requirement: Map switches
Maps SHALL be on by default for the server, with OpenStreetMap-based providers (OpenFreeMap for tiles, Photon for search). The owner SHALL be able to turn maps off for the server or set other tile and search providers in Settings → Server → Maps, each overridable by the optional `OPENTODO_MAPS` (`on` or `off`), `OPENTODO_MAPS_TILES_URL` and `OPENTODO_MAPS_GEOCODER_URL` variables, shown read-only in Settings when set; an invalid value SHALL stop startup with a message naming the variable. Each user SHALL be able to turn maps off for themselves in Settings → General, synced as an additive preference. A demo instance SHALL have maps off unless `OPENTODO_MAPS=on` is set. With maps off for the server or the user, the app SHALL make no request to any map route.

#### Scenario: Fresh server
- **WHEN** a new server starts without any map variable
- **THEN** maps are on, the Server page names OpenFreeMap and Photon as the providers, and no setting is required

#### Scenario: User turns maps off
- **WHEN** a user turns maps off in Settings → General on one device
- **THEN** after sync none of their devices shows a map or offers address search, and their locations keep working with coordinates and "Open in maps"

#### Scenario: Invalid variable
- **WHEN** the server starts with `OPENTODO_MAPS=sometimes`
- **THEN** the process exits non-zero with a message naming `OPENTODO_MAPS`

#### Scenario: Demo instance
- **WHEN** a demo instance starts without `OPENTODO_MAPS`
- **THEN** maps are off and the location editor offers coordinates, current position and places only

### Requirement: Map privacy is stated
The location editor's search field SHALL say, in one line, that what is typed there is sent to the map provider through this server. The user guide and the self-hosting guide SHALL name the default providers, what reaches them (the search text, the tile coordinates of the area being viewed), what never does (accounts, task content, the viewer's address), and how to turn maps off.

#### Scenario: Before the first search
- **WHEN** the user opens the location editor with maps on
- **THEN** the line under the search field names the provider and says the search text is sent to it through this server
