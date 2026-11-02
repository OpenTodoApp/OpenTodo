## ADDED Requirements

### Requirement: Google Play build without location reminders
Until Google Play approves the app's background-location declaration, the Android app built for Google Play (the AAB) SHALL NOT declare `ACCESS_BACKGROUND_LOCATION`, `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`, SHALL NOT list the `geofences` bridge capability, SHALL never ask for location, and SHALL add `store: 'play'` to the bridge object. In that app, Settings → Notifications → Location reminders SHALL show no switch and say that location reminders come to the Google Play version later and that the app from GitHub or F-Droid has them. The APK published on GitHub and built by F-Droid SHALL keep the three permissions and the capability, and its build SHALL stay the reproducible one F-Droid verifies. CI SHALL read the built AAB's and APK's manifests and fail when the AAB declares any of the three permissions or the APK lacks one. This requirement touches no synced data: nothing is stored, and offline behaviour and convergence are unchanged.

#### Scenario: Play app
- **WHEN** a person opens Settings → Notifications in the Android app installed from Google Play
- **THEN** Location reminders reads "Location reminders come to the Google Play version later; the GitHub/F-Droid app has them." with no switch, and Android never asks for location

#### Scenario: GitHub or F-Droid app
- **WHEN** a person opens the same card in the app from GitHub or F-Droid
- **THEN** the switch "On this phone" is there as before, and the APK declares background location

#### Scenario: The permission slips into the bundle
- **WHEN** a change makes the AAB declare `ACCESS_BACKGROUND_LOCATION` again, or removes it from the APK
- **THEN** the Android CI job fails and names the permission and the build
