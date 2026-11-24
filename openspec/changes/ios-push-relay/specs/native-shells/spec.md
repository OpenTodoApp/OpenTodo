# Spec Delta

## ADDED Requirements

### Requirement: Wake-ups through the push relay on iPhone
The iOS shell MAY offer the bridge capability `apple-push` in builds that carry the push entitlement. When the user turns on delivery through the relay, the shell SHALL ask for notification permission and register for remote notifications. It SHALL mint a random 32-byte due token and keep it in the Keychain, readable by the app and its notification extension only, never in a backup. It SHALL hand the web app, once, the APNs token, its environment and the due token; a renewal SHALL hand over the token and environment only. The web app SHALL post them to the user's own server and keep none of them. The shell SHALL contact no service for this other than Apple and the configured server.

On a background wake (`refresh`), the shell SHALL run the web app in the background exactly as its background refresh does, so the reminder schedule and the widgets follow. On an alert wake (`due`), the notification extension SHALL ask the configured server, with the due token, which reminders are due. It SHALL then show the first reminder's title as plain text (or the generic text), with the same actions and tap target as a reminder scheduled on the device, and SHALL remove a pending or delivered local notification for the same reminder so it shows once. When the server cannot be reached within 8 seconds, answers with anything but the due reminders (such as a login wall's page or redirect), or the due token is gone, the extension SHALL keep the generic text, write nothing and log nothing about content. The shell SHALL ignore any URL in a push payload.

When the APNs token changes, the shell SHALL report it, and the web app SHALL renew the registration. When the user turns delivery off, signs out, locks an encrypted account or changes servers, the shell SHALL delete the due token, and the web app SHALL remove the device's registration from the server. Reminders scheduled on the device SHALL keep working with or without the relay. Nothing here writes task data: a notification's actions are the web app's own reminder operations, which apply on the device, work offline and converge like any other.

#### Scenario: A reminder set on another device a minute ago
- **WHEN** delivery through the relay is on, the iPhone app was force-quit, and a reminder due in two minutes is added on a computer
- **THEN** the iPhone shows the reminder at its time with Done, Snooze 10 min and Dismiss, and its title when task titles are included

#### Scenario: Background wake
- **WHEN** a reminder is moved on another device and a `refresh` wake arrives while the app is in the background
- **THEN** the shell runs the web app in the background, the local schedule follows the move, and the run ends on `backgroundDone`

#### Scenario: Background wakes withheld by iOS
- **WHEN** iOS delays or drops a `refresh` wake (Low Power Mode, Background App Refresh off, or throttling)
- **THEN** the reminder still arrives on time through a `due` wake, because the server knows the device's schedule is stale

#### Scenario: Scheduled on the phone and pushed
- **WHEN** a reminder is in the phone's schedule and a `due` wake for it arrives as well
- **THEN** one notification remains, for that reminder

#### Scenario: Server unreachable from the extension
- **WHEN** a `due` wake arrives and the server does not answer within 8 seconds
- **THEN** the notification shows the generic reminder text, and a tap opens the app, which syncs

#### Scenario: Behind a login wall
- **WHEN** the server sits behind a login wall that does not let `/api/v1/push/apple/due` through, and a `due` wake arrives
- **THEN** the notification shows the generic reminder text on time

#### Scenario: Encrypted account
- **WHEN** the account is end-to-end encrypted
- **THEN** the server returns no title, the notification reads the generic text, and the task opens decrypted on tap

#### Scenario: Sign-out
- **WHEN** the user signs out
- **THEN** the shell deletes the due token, the server deletes the registration, and a later wake for that device shows at most the generic text

#### Scenario: A payload with a link
- **WHEN** a push carries a URL in its payload
- **THEN** a tap opens the app at its configured server, never that URL

#### Scenario: Build without the entitlement
- **WHEN** the app is built from source without a push entitlement
- **THEN** the shell does not list `apple-push` and the setting is not shown
