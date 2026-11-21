# Proposal

## Why

In the Android app a task's location cannot use the phone's position, and "Open in maps" does nothing (GitHub issue [#1476](https://github.com/OpenTodoApp/OpenTodo/issues/1476)). "Use my location" ends with "The browser did not share the position." without Android ever asking: the shell's web view refuses every geolocation request because the app never answers it. "Open in maps" on a phone is a `geo:` link (`task-locations` "Open in maps"), and the shell's external-link allow-list (`https`, `http`, `mailto`, `tel`) drops it, after the web app has already taken the tap.

## What Changes

- **Position for the server's pages.** When a page of the configured server asks for the position, the Android shell asks Android for location (fine or approximate, the same prompt location reminders use) if it has not been allowed, and answers the page with the result. Pages of other origins are refused without a prompt, the answer is never kept by the web view, and the Google Play build, which declares no location permission, refuses without asking.
- **`geo:` links leave the shell.** The Android shell's allow-list gains a `geo:` point of the web app's shape (`geo:<lat>,<lon>`, optionally `?q=<lat>,<lon>`), handed to the maps app; without one, the same point opens on openstreetmap.org in the browser. Any other `geo:` form stays refused.

Out of scope: the iOS shell (its own issue if it shows the same gaps), and `http` servers other than localhost, where the web view, like a browser, offers no position at all. A repair: it advances no new `ROADMAP.md` item and completes what `native-shells` and `task-locations` promise in the Android app.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: "Obsidian note links leave the shell" names the Android `geo:` exception to the allow-list; a new requirement "Position for the web app" covers the geolocation answer.

## Impact

- `mobile/android/app/src/main/java/app/opentodo/WebLocation.kt` (new, pure Kotlin), `Bridge.kt` (`safeExternal`), `MainActivity.kt` (`onGeolocationPermissionsShowPrompt`, the `openExternal` fallback, one shared location prompt).
- No new permission (fine and coarse location are already declared in the APK), no dependency, no web app, server, sync or data change.
