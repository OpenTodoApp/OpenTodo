# Data safety declaration (Google Play)

Answers for the Play Console "Data safety" form, kept next to the code so a change to the app's behaviour changes them in the same pull request.

- **Does the app collect or share any of the required user data types?** No. The app talks only to the OpenTodo server the user enters on the first-run screen, which the user or their organisation runs. Nothing is sent to the developer or to any third party.
- **Third-party SDKs:** none. The app ships AndroidX libraries only (`./gradlew :app:checkDependencies` fails on anything else).
- **Analytics, crash reporting, advertising:** none.
- **Data stored on the device:** the server address, the next seven days of reminders (titles only when the user allows them and the account is not encrypted), the Today widget's last publication, and, when the user turns on fingerprint unlock, the account key encrypted under a Keystore key that needs a biometric for every use. All in app-private storage, excluded from Android backup and device transfer, and deleted on sign-out, on lock of an encrypted account (reminders), and on "Change server".
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
