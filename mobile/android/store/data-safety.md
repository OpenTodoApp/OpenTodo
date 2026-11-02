# Data safety declaration (Google Play)

Answers for the Play Console "Data safety" form, kept next to the code so a change to the app's behaviour changes them in the same pull request.

- **Does the app collect or share any of the required user data types?** No. The app talks only to the OpenTodo server the user enters on the first-run screen, which the user or their organisation runs. Nothing is sent to the developer or to any third party.
- **Third-party SDKs:** none. The app ships AndroidX libraries only (`./gradlew :app:checkDependencies` fails on anything else).
- **Analytics, crash reporting, advertising:** none.
- **Location:** not collected or shared. With "Location reminders on this phone" turned on, the app watches the places of the user's location reminders through Android's own proximity alerts (no Google Play services, no third-party library) and shows a notification when the phone arrives at or leaves one. The position is used on the device only: it is never sent to the user's server, the developer or anyone else, never handed to the web app and never logged; the one position kept is the point the places were last ranked from, in app-private storage.
- **Data stored on the device:** the server address, the next seven days of reminders (titles only when the user allows them and the account is not encrypted), the armed location reminders (place coordinates, radius, titles under the same rule) with the last ranking position, the Today widget's last publication, and, when the user turns on fingerprint unlock, the account key encrypted under a Keystore key that needs a biometric for every use. All in app-private storage, excluded from Android backup and device transfer, and deleted on sign-out, on lock of an encrypted account (reminders and location reminders), and on "Change server".
- **Is data encrypted in transit?** Yes, https; plain http is accepted only for addresses on the device or the local network, after a warning.
- **Can users request deletion?** Data lives on the user's own server; "Change server" or uninstalling removes everything the app stored on the phone.

## Permissions

| Permission | Why |
| --- | --- |
| `INTERNET` | load the app from the user's server |
| `ACCESS_NETWORK_STATE` | retry the first-run check when the network returns |
| `POST_NOTIFICATIONS` | show reminders |
| `SCHEDULE_EXACT_ALARM` | show reminders on time; inexact alarms are used when refused |
| `RECEIVE_BOOT_COMPLETED` | arm the reminders again after a restart |
| `USE_BIOMETRIC` | optional fingerprint or face unlock of an encrypted account |
| `ACCESS_FINE_LOCATION` | optional location reminders: notice arriving at or leaving a task's place, on the device only |
| `ACCESS_COARSE_LOCATION` | requested together with fine location, as Android 12 and later require |
| `ACCESS_BACKGROUND_LOCATION` | location reminders fire while the app is closed ("Allow all the time"); asked only after the in-app disclosure, never otherwise |
