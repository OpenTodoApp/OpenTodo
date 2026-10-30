# Design

## Context

- **Reminders** are op-log entities with `kind` (`relative`, `absolute`, `deadline`), `offset_minutes`, `fire_at`, `delivered_at` and `dismissed_at`.
  - The server scheduler pushes reminders whose `fire_at` has passed.
  - Shells with the `reminders` capability receive the next 7 days of reminders and schedule them as exact alarms.
- **The task location** (`task.location`) is a content field `{name?, address?, lat?, lon?, place_id?}`. A `place_id` resolves to the place's current `geo`.
- **The bridge** (`web/src/lib/shell.ts`) is versioned (`bridge: 1`) and capability-gated, and its payloads are pinned by shared fixtures.

## Decisions

**D1. Additive kinds and one field on the reminder.**

| Field | Change |
|---|---|
| `kind` | the enumeration gains `arrive` and `leave` |
| `radius_m` | new, nullable positive integer, default `null`; required 100–5,000 for the location kinds, ignored (and refused by REST) for the others |
| `fire_at`, `offset_minutes` | always `null` for the location kinds; sync validation refuses a value |

- `kReminderKind` accepts the new values, and a new kind `kRadius` validates the range.
- Not content: a radius on its own reveals nothing. The place is in the task's encrypted `location`.
- Alternative: copy the coordinates onto the reminder. Rejected:
  - it duplicates a content field that is already encrypted;
  - it goes stale when the task's place moves;
  - it adds a second copy to keep in step.
  
  Reading the task's location also keeps "linked place follows the place".
- Alternative: a separate `geofence` entity. Rejected: a location reminder has the reminder's whole lifecycle (dismiss, Trash, export, history), so it is a reminder.

**D2. Armed state and firing rules (on the device).** A location reminder is armed on a device when all of these hold:
- it isn't deleted or dismissed;
- its task is open and not in the Trash;
- the task's resolved location has `lat` and `lon`;
- for an encrypted account, the device is unlocked.

Firing:
- A crossing in the reminder's direction shows a notification.
- The shell keeps a per-reminder `lastFiredAt` in private storage and ignores crossings within 60 minutes of it. This absorbs GPS jitter at the edge of a circle.
- Firing writes nothing: `delivered_at` stays server-only and meaningless here.
- Done completes the task, which disarms every reminder of it. Dismiss writes `dismissed_at`, which disarms it everywhere after sync. A tap opens the task.
- Snooze is not offered: "remind me next time" is the default behaviour.

Convergence:
- Dismiss on one phone and an edit of the radius on another converge per field.
- A reminder dismissed on A and re-armed on B (B clears `dismissed_at` with "Arm again" in the panel) follows LWW like snooze and dismiss today.

**D3. The bridge capability `geofences`.**

```
scheduleGeofences(json) -> 'granted' | 'foreground-only' | 'denied' | 'unavailable'
json = {"version":1,"regions":[{"id","taskId","lat","lon","radius","on":"arrive"|"leave","title"?}]}
```

- The web app sends at most 100 regions: every armed location reminder, sorted by reminder id for a stable payload. It sends them whenever the set changes, and during the existing hourly background refresh.
- An empty list clears everything. The existing sign-out, lock and server-change resets also clear regions.
- **The shell picks the regions to register:** up to 19, plus one 1 km "re-rank" region around the last ranking position.
  - Android: platform `LocationManager.addProximityAlert`.
  - iOS: Core Location region monitoring.
  - With more regions than that, the shell ranks by distance to the device's last known position and re-ranks when the phone exits the re-rank region.
  - Alternative: Google Play services `GeofencingClient`. Rejected: the Android shell is AndroidX-only by rule, F-Droid builds can't carry it, and 20 regions cover the common case.
  - The position stays in the shell. It is never passed to the web view, written to storage beyond the current ranking anchor, or logged.
- **Fixtures:** the payload and the notification action addresses join `bridge-fixtures` (`web/src/lib/shellBridge.fixture.*`), so the web app and both shells' unit tests read the same files.
- `BRIDGE_VERSION` stays 1: a new capability is additive by the bridge rules. An older shell without `geofences` is simply never called.
- Alternative: watch the position in the web view with `navigator.geolocation.watchPosition`. Rejected: it doesn't run in the background, and it would drain the battery.

**D4. Permissions and disclosure.**

- **Setting:** "Location reminders on this phone" is a per-device setting in Settings → Notifications. It is shown only when the shell lists `geofences`, and it is off by default.
- **Turning it on** shows a disclosure sheet: "OpenTodo checks your location only to notice when you arrive at or leave the places of your location reminders. Your location stays on this phone and is never sent to your server." It then requests:
  - Android: fine location, then background location ("Allow all the time"), as Android 11+ requires in two steps;
  - iOS: When In Use, then Always.
- **With only foreground permission** the bridge answers `foreground-only`. Settings shows "Choose Allow all the time in Android settings" with an Open settings button, and nothing is armed.
- **Play Store:** the background-location declaration and the video Play requires are prepared in `play-production`. This change ships the disclosure screen Play's policy requires. F-Droid has no such declaration.

**D5. Web client and degradation.**

- **The task panel's reminder menu** gains "When I arrive" and "When I leave". Both open a small form with:
  - the place name (read-only, from the task's location);
  - a radius slider with presets 100, 150, 300, 500 and 1,000 m;
  - for an absolute place, a map preview using the existing lazy MapLibre view when maps are on, or just the coordinates when maps are off.
- **Without coordinates** (address only, or no location), the items are disabled with "Add a location with a point on the map first" and a link that opens the location editor.
- **Chip text:** "Arriving at Post office" or "Leaving Home".
- **Where it can't fire:** in a browser, on a shell without `geofences`, or with the setting off, the chip adds "Fires on your phone" (a tooltip on desktop, a second line on phones). The Notifications settings in a browser say "Location reminders fire only in the Android or iPhone app, with Location reminders on".
- **No in-app or push firing**, since there's no position on the server and the browser is out of scope.
- **Progressive disclosure:** the two items sit in the existing reminder menu, which Simple-list users already have. They show nothing new unless a task has a location, and the location property is itself an opt-in property.
- **Interface budget:** no chrome rows above lists, no new task property (it is a reminder chip), no sidebar entry, no new scroll region and no new shortcut.

**D6. Server, API, CalDAV, export.**

- **REST:** `POST /api/v1/reminders` and `PATCH /api/v1/reminders/{id}` accept the kinds and `radius_m`, under the existing authentication (401 without credentials; a `read` token is refused on writes; viewers can't write reminders on shared tasks, as today). These are refused with 400 `invalid_operation`:
  - a missing or out-of-range radius;
  - a `fire_at` or offset on a location kind;
  - `radius_m` on another kind.
- **Scheduler:** unchanged. A `null` `fire_at` is never due, and "Reminders of completed tasks are dismissed by the server" doesn't touch them.
- **CalDAV:** location reminders are not served as `VALARM`, so the "absent alarm deletes the reminder" rule never applies to them. An inbound `VALARM` with a `PROXIMITY` property stays client data and creates no reminder. That includes Apple's proximity alarm, which carries a 1976 absolute trigger and today would become a bogus absolute reminder.
- **Export, import, Trash and history:** location reminders are included like any reminder. Importing one whose task has no coordinates keeps it, disarmed.
- **CLI:** `ot task show` lists "When I arrive at Post office (150 m)". Creating them from the CLI is out of scope.

## Risks / Trade-offs

- **Battery.** Platform geofencing is low-power, and nothing runs otherwise. The hourly refresh already exists.
- **Store review of background location** may delay the Android release. Mitigation: the disclosure and the off-by-default switch.
- **Several phones each notify.** That's acceptable: the reminder belongs to the person, and Dismiss on one silences all after sync.
- **The 20-region limit on both platforms.** Ranking by distance handles the common case of a handful of places. It's documented.

## Size

- Web: under 2 KB gzip in the task panel and settings chunks. No entry-chunk change.
- Android: platform APIs only, so the APK size is unchanged apart from the code (under 30 KB).
- iOS: Core Location only, a system framework.
- Server: validation only.
