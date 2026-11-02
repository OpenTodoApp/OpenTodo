# Design: location reminders later on Google Play

## D1. A Gradle property, not a product flavor

A flavor would rename the tasks (`assemblePlayRelease`) and the output paths that `scripts/android-repro.sh` and F-Droid's `gradle: yes` recipe rely on. A property read with `providers.gradleProperty("opentodo.play")` leaves the default build untouched: without it nothing changes but one constant (`BuildConfig.PLAY_BUILD = false`). With it, the `release` source set's manifest is pointed at `src/play/AndroidManifest.xml`, which the manifest merger applies over `main` with `tools:node="remove"` on the three location permissions. The property is passed only to `bundleRelease`; the APK and the AAB come from two Gradle invocations.

## D2. The web app learns it from the bridge

The Play build leaves `geofences` out of the capabilities, so the web app never calls `scheduleGeofences` (the existing rule for a shell without the capability), and adds `store: 'play'` to `window.opentodoShell`. `LocationRemindersSettings` picks a fourth mode, `play`, before `update`, and shows one line instead of the switch. The task panel already says "Fires on your phone" for a shell without `geofences`. As a guard, the Bridge never asks for location in the Play build even if called.

## D3. The check reads the built artifacts

`scripts/android-store-check.sh <aab> <apk>`: bundletool (pinned release, SHA-256 checked) dumps the AAB's manifest, aapt2 from the pinned build tools dumps the APK's permissions. The AAB must have none of the three location permissions, the APK all three, both `INTERNET` (so an empty dump never passes). CI runs it on unsigned builds on every Android run and on the signed release files on tags.

## Data model, size, interface budget

No data model change. No dependency in the app; bundletool is a CI-only download. The APK is unchanged in size; the web bundle grows by one string. The settings card replaces its switch with one line in the Play app: no new chrome.
