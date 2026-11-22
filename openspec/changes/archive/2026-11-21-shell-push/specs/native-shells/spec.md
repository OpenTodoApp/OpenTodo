# Spec Delta

## ADDED Requirements

### Requirement: Reminders by push through UnifiedPush
The Android shell MAY offer the bridge capability `push`: it registers with the UnifiedPush distributor the user chose, and hands the web app a Web Push subscription (the endpoint the distributor gave, and a public key and secret the shell made on the phone). The web app SHALL subscribe the device with it on the user's server, exactly as a browser is subscribed, and SHALL do so only when the user turned push delivery on, the server offers push, and the shell lists the capability. The shell SHALL keep the private key on the phone, never hand it to the page, and SHALL use no push service of its own and no service the user did not choose.

When the distributor delivers a message, the shell SHALL decrypt it on the phone (RFC 8291), and for a reminder SHALL show the same notification, with the same actions, as a reminder scheduled on the device, without the web app running. A reminder SHALL alert once: when both the device's schedule and a push carry it, the second SHALL replace the first without another sound. A message that cannot be decrypted or is not a reminder SHALL show nothing. After a message the shell SHALL refresh in the background, so its schedule and widgets follow.

When the distributor gives a new endpoint, the shell SHALL keep it and the web app SHALL subscribe it at its next run; when the distributor unregisters the app, or the user turns push delivery off, signs out or changes servers, the shell SHALL forget the registration and its keys and the web app SHALL remove the device's subscription from the server. Reminders scheduled on the device SHALL keep working with or without push. Nothing here writes task data: a notification's actions are the web app's own operations, which apply on the device, work offline and converge like any other.

The subscription the shell hands over and a message the server encrypts for it SHALL be part of the shared bridge fixtures, written by the server's own encryption.

#### Scenario: A reminder set on another device a minute ago
- **WHEN** push delivery is on, the Android app is closed, and a reminder due in two minutes is added on a computer
- **THEN** the phone shows the reminder at its time, with Done, Snooze 10 min and Dismiss, although the phone never refreshed in between

#### Scenario: Scheduled on the phone and pushed
- **WHEN** a reminder is both in the phone's schedule and pushed by the server at the same time
- **THEN** the phone alerts once and shows one notification

#### Scenario: No distributor
- **WHEN** no UnifiedPush app is installed
- **THEN** the shell reports that push is unavailable, the setting says a UnifiedPush app is needed, and reminders scheduled on the phone work as before

#### Scenario: The distributor rotates the endpoint
- **WHEN** the distributor gives the app a new endpoint while the app is closed
- **THEN** the next background run subscribes the new endpoint on the server and removes the old one, and reminders in between still fire from the phone's schedule

#### Scenario: Sign-out
- **WHEN** the user signs out
- **THEN** the device's subscription is removed from the server, the shell unregisters from the distributor and deletes its keys, and a later message for that registration shows nothing

#### Scenario: A message the app cannot read
- **WHEN** the distributor delivers bytes that do not decrypt with the app's keys
- **THEN** nothing is shown and nothing of the message is logged beyond its length

#### Scenario: Encrypted account
- **WHEN** the account is end-to-end encrypted
- **THEN** the pushed reminder carries no task name, the notification reads the generic text, and the task opens decrypted on tap

#### Scenario: Fixture
- **WHEN** the server's encryption changes how it writes a message
- **THEN** the server test that writes the fixture fails until it is regenerated, and then the Android unit test fails until the shell decrypts the new form
