# Location reminders later on Google Play

## Why

`location-reminders` (PR #802) added `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` and `ACCESS_BACKGROUND_LOCATION` to the Android manifest. A Play build that declares background location needs Play's background-location declaration approved before it can go out, and the owner decided (DECISIONS.md, "Location reminders") to ship the feature on F-Droid and GitHub first and on Google Play only after that review. The release builds one AAB, which goes to Play, and one APK for GitHub and F-Droid, so release 0.21.0 needs the two to differ.

## What Changes

- A Gradle property `opentodo.play=true` makes the **Google Play build**: a release-manifest overlay (`app/src/play/AndroidManifest.xml`, `tools:node="remove"`) removes the three location permissions, `BuildConfig.PLAY_BUILD` is true, the bridge lists no `geofences` capability, adds `store: 'play'` to `window.opentodoShell`, and never asks for location.
- The web app's **Settings → Notifications → Location reminders** shows, in that app, one line instead of the switch: "Location reminders come to the Google Play version later; the GitHub/F-Droid app has them." (six languages).
- CI builds the AAB with the property and the APK without it, on tags (signed) and on every Android run (unsigned), and `scripts/android-store-check.sh` fails when the AAB's manifest (`bundletool dump manifest`) declares a location permission or the APK's (`aapt2 dump permissions`) lost one.
- The APK for GitHub and F-Droid is built exactly as before (`assembleRelease`, no property), so `scripts/android-repro.sh` and the F-Droid metadata need no change.
- Docs: the Android guide, Location reminders, the Play declaration notes, RELEASING.md and mobile/README.md say where location reminders are available.

Not **BREAKING**: no op field, route or environment variable. The bridge stays version 1; `store` is an optional field.

Out of scope: submitting the Play declaration (owner item, `mobile/android/store/play-background-location.md`), product flavors or a second application id, and iOS.

ROADMAP: follows `location-reminders` (0.21.0); unblocks the 0.21.0 release.
