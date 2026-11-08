# Play Console: background location declaration

The text for the Play Console's **App content → Sensitive app permissions → Location permissions** form (OpenSpec change `location-reminders`, design D4). The owner submits it; nothing here is sent automatically.

**The Play build leaves location reminders out until the declaration is approved** (owner decision, 2026-10-29; OpenSpec change `play-location-later`). The AAB that CI uploads to Play is built with `-Popentodo.play=true`: `app/src/play/AndroidManifest.xml` removes `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` and `ACCESS_BACKGROUND_LOCATION`, the bridge offers no `geofences` and says `store: 'play'`, and Settings → Notifications → Location reminders reads "Location reminders come to the Google Play version later; the GitHub/F-Droid app has them." The APK on GitHub and F-Droid keeps the feature. CI fails when the AAB declares a location permission or the APK lost one (`scripts/android-store-check.sh`). Submit this form with a build that includes the feature (for example on a closed testing track); once Play approves it, drop `-Popentodo.play=true` from the release step in `.github/workflows/ci.yml` and the AAB check in `scripts/android-store-check.sh`.

## Does your app access location in the background?

Yes, only for the optional feature **location reminders**, and only after the user turns it on.

## Which features in your app use location in the background?

Location reminders: a person adds a reminder to one of their own tasks that fires when they arrive at, or leave, the task's place ("Buy stamps when I arrive at the post office", "Take the parcel when I leave home"). The reminder has to fire while the app is closed, which is the whole point of the feature, so the app needs location access all the time.

## Feature description (for the form, at most 500 characters)

Location reminders notify you when you arrive at or leave the place of one of your tasks, for example "Buy stamps" at the post office. They must work while the app is closed. The feature is off by default; you turn it on in Settings → Notifications. The phone watches up to 19 places with Android's own proximity alerts; your position stays on the phone and is never sent to your server, to us or to anyone else.

## How does the user benefit, and why is foreground location not enough?

The reminder exists to interrupt the person at the right place when they are not looking at the app: walking past the post office, leaving home in the morning. With only "While using the app" the app would have to be open on screen at that moment, which defeats the reminder. The app asks for "Allow all the time" only when the user turns the feature on, and with only foreground access it explains what is missing and watches nothing.

## Prominent disclosure (shown in the app before Android's permission prompt)

Shown inline in **Settings → Notifications → Location reminders** when the user turns on "On this phone", with **Continue** and **Not now**:

> OpenTodo checks your location only to notice when you arrive at or leave the places of your location reminders. Your location stays on this phone and is never sent to your server.
>
> Next, Android asks for your location: allow it, then choose Allow all the time.

The disclosure is translated into German, French, Spanish, Italian and Portuguese with the rest of the app. Android's permission prompt appears only after **Continue**.

## Is location data collected, shared or sold?

No. The position is used on the device only, to decide which places to watch and to notice a crossing. It is never sent to the user's own server, to the developer or to any third party, never handed to the app's web view and never logged. The app has no Google Play services, analytics or advertising SDK (AndroidX only). See `data-safety.md`.

## Video for the review (to record, owner item)

Play asks for a short video (30 seconds or less, YouTube link) showing the disclosure, the permission prompt and the feature:

1. Open a task with a location (a saved place such as "Post office"), open **When → Reminders → Add reminder → When I arrive**, keep 150 m, **Save**. The chip reads "Arriving at Post office · 150 m".
2. Open **Settings → Notifications → Location reminders**, turn on **On this phone**: the disclosure appears; tap **Continue**.
3. Android asks for location: **While using the app**, then the second prompt or settings page: **Allow all the time**. The card reads **On**.
4. Close the app and arrive at the place (or use a mock location from the developer options): the notification "Buy stamps" with **Done** and **Dismiss** appears.

## Where the code is

- Permission request and disclosure: `web/src/app/LocationRemindersSettings.tsx`, `mobile/android/app/src/main/java/app/opentodo/MainActivity.kt`.
- Region watching: `mobile/android/app/src/main/java/app/opentodo/Geofences.kt`, `GeofenceSchedule.kt`.
- User documentation: `docs/location-reminders.md`, `docs/android-app.md`.
