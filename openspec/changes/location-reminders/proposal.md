# Proposal

## Why

"Buy stamps when I'm at the post office", "Take the parcel when I leave home": location reminders are one of the oldest asks of a task app. Things famously lacks them (research §1 "Things 3"), and the research claims OpenTodo "already solved" them. It hasn't: the gap analysis (§1 Things row, §3 claim 8) found that tasks store a place (`task-locations`) but nothing ever fires on location. The Android shell already schedules time reminders on the device (`native-shells` "Reminders scheduled on the device"), and the iOS shell (`ios-shell`) follows the same bridge contract. So the missing piece is small and stays local-first. The phone, not the server, watches the place, and the user's position never leaves the phone.

## What Changes

- **Two new reminder kinds, `arrive` and `leave`.** A location reminder belongs to a task like any reminder. It fires when the phone enters or exits a circle around the task's location. A linked place (`task-locations` "Places") uses the place's current position.
  - **Radius:** the additive reminder field `radius_m`, 100 to 5,000 m, default 150.
  - **Firing:** a location reminder has no firing time. It stays armed while its task is open and the reminder is neither dismissed nor deleted. It fires on every matching crossing, at most once an hour per reminder on a device.
- **Where it's set.** In the task panel's reminder menu: "When I arrive" and "When I leave". These are offered when the task's location has a point on the map; otherwise they say "Add a location with a point on the map first" and link to the location editor. The reminder chip reads "Arriving at Post office · 150 m".
- **The shells watch, the server doesn't.**
  - **Bridge:** a new bridge capability `geofences`, with method `scheduleGeofences(json)` and its fixture in the shared bridge fixtures. The web app, while it runs in a shell, hands over the armed location reminders: the reminder id, task id, latitude, longitude, radius and direction. It includes the title only under the existing "include task titles" rule.
  - **Registration:** the Android shell registers them with the platform's proximity alerts, the iOS shell with region monitoring. The 19 nearest are registered at a time, re-ranked on the device when the phone moves far.
  - **Notification:** a crossing shows a system notification with **Done** (complete the task) and **Dismiss** (disarm the reminder everywhere), through the web app's own operations.
  - **Privacy:** the position is never handed to the web app, never sent to the server, and never stored beyond what the operating system keeps for geofencing.
- **Per-device opt-in.** On a shell with the capability, Settings → Notifications gains "Location reminders on this phone", off by default. Turning it on shows a short disclosure, then asks for the platform's background location permission ("Allow all the time" / "Always"). With only foreground permission it explains what is missing and arms nothing.
- **Clear degradation.**
  - In a browser, on the desktop and on a shell without the capability, location reminders can be created and edited. They never fire there, and the chip carries "Fires on your phone". There's no in-app firing and no push.
  - For an account with end-to-end encryption, coordinates are handed over only while the device is unlocked, and the regions are removed on lock, sign-out and server change.
- **API.**
  - `POST`/`PATCH /api/v1/reminders` accept `kind: "arrive" | "leave"` and `radius_m`. Values out of range get 400 `invalid_operation`, under the existing authentication rules.
  - The CLI shows location reminders in `ot task show`.
  - CalDAV doesn't serve them as alarms and never deletes them on a client's PUT.

No new route, no new environment variable, no server dependency. Additive reminder kind values and one additive reminder field. Not **BREAKING**.

## Out of scope

- **Quick-add phrases** ("when I get to the gym") and agent or MCP tools for location reminders. The agent reminder tools are part of `agent-tools-complete`.
- **Mapping to CalDAV `PROXIMITY` alarms and Apple's structured location.** Inbound proximity alarms stay client data, as today.
- **Firing in a browser.** There is no background location on the web.
- **Wi-Fi, Bluetooth or car "connect/disconnect" triggers, and time windows ("only on weekdays").**
- **Location reminders on places without a task.**

## Roadmap

Advances ROADMAP-1.0 milestone 0.21 "Horizons and home", item `location-reminders`. The iOS half lands once `ios-shell` ships; the Android half needs only the Android shell. No linked issue.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reminders`:
  - MODIFIED "Reminder entity", which gains the kinds and `radius_m`;
  - ADDED "Location reminders", "Setting a location reminder" and "Location reminders through the API".
- `native-shells`: ADDED "Location reminders watched on the device".
- `caldav-sync`: ADDED "Location reminders are not calendar alarms".

## Impact

- **Data model and sync:** the reminder `kind` gains the values `arrive` and `leave`, a new additive field `radius_m` (nullable integer, 100–5,000) joins the reminder, and a location reminder's `fire_at` is always `null`. No new entity and no migration.
- **Server scheduler:** unchanged. It already ignores reminders without a firing time. Older web clients still cached in a tab show an unknown kind as a reminder without time and never fire it.
- **E2EE:** the task's `location` is already a content field. The reminder carries no content. Coordinates reach the shell only decrypted, on the device.
- **Shells:** a new capability in the Android shell (platform `LocationManager` proximity alerts, with no new dependency, so it stays AndroidX-only and F-Droid-friendly) and in the iOS shell (Core Location region monitoring). The Play Store needs the background location declaration, and a prominent in-app disclosure is shown.
- **API/CLI:** additive kind values and one field on the existing reminder routes.
- **Bundle and binary size:** under 2 KB gzip in the web app. The shells add only code, with no library. The server binary is unchanged apart from validation.
