## 1. The Play build

- [x] 1.1 `opentodo.play` Gradle property, `BuildConfig.PLAY_BUILD`, and the release-manifest overlay `app/src/play/AndroidManifest.xml` removing the three location permissions. Verify: the CI step "Play AAB without location, APK with it".
- [x] 1.2 The bridge lists no `geofences` and adds `store: 'play'` in the Play build, and never asks for location there. Verify: `PlayBuildTest` (unit tests in `make android`).

## 2. The web app

- [x] 2.1 `store?: 'play'` on `OpenTodoShell`; the `play` mode of Settings → Notifications → Location reminders with its line in six languages. Verify: `locationReminders.test.tsx`, `make i18n-check`, `npm test`, `npm run build`.

## 3. CI and release

- [x] 3.1 `scripts/android-store-check.sh` (bundletool for the AAB, aapt2 for the APK); the Android job builds both and runs it on every run, and again on the signed files on tags, where the AAB is built with `-Popentodo.play=true` and the APK without. Verify: the Android CI job.
- [x] 3.2 The APK build is unchanged (`assembleRelease` without the property), so `scripts/android-repro.sh` and `store/fdroid/app.opentodo.yml` stay as they are. Verify: `git diff` touches neither.

## 4. Docs

- [x] 4.1 `docs/android-app.md`, `docs/location-reminders.md`, `mobile/android/store/play-background-location.md`, RELEASING.md, mobile/README.md, the `play-upload.mjs` header and a CHANGELOG line. Verify: `make docs-check`.
