# Tasks

## 1. Android shell

- [x] 1.1 `WebLocation.allowed`, `mapLink` and `fallback` in `WebLocation.kt`. Verify: `WebLocationTest` (`./gradlew :app:testDebugUnitTest`).
- [x] 1.2 `MainActivity`: `onGeolocationPermissionsShowPrompt` answers through `requestLocationPermission`; a second request waits for the same answer. Verify: `make android` (compile, lint).
- [x] 1.3 `Bridge.safeExternal` accepts a `geo:` point; `openExternal` falls back to openstreetmap.org. Verify: `WebLocationTest`, `make android`.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Fixed/android-location-and-map.md`. Verify: `make repo-check`.
- [ ] 2.2 On a phone with the APK: "Use my location" shows Android's prompt once and fills the location; "Open in maps" opens the maps app, and without one the point on openstreetmap.org.
