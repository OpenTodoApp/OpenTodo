## MODIFIED Requirements

### Requirement: Done from a reminder notification
A system notification of a reminder SHALL offer **Done** first, then **Snooze 10 min** and **Dismiss**, in the Android app and in web push; where the browser shows fewer buttons, the first ones SHALL stay. **Done** SHALL complete the reminder's task through the app's own completion, except as below: a repeating task SHALL record the occurrence and move to its next one rather than end, and completing SHALL disarm the task's reminders. The service worker SHALL never write the completion itself: with a window of the app open it SHALL hand the action to exactly one window, and with none it SHALL open the app at the address the Android app uses for Done, which completes the task. The Android app SHALL apply it in the background without opening. The completion SHALL be ordinary operations, queued while offline and uploaded on the next sync, encrypted at upload on an encrypted account, and converging like any completion. **Done** SHALL apply once the first sync of the app it opened has ended, at most 30 seconds later and 10 seconds when sync never starts; offline, or when sync cannot run, at once. On a repeating task whose relative or deadline reminder fires more than an hour from now, both as computed on the device and as stored, **Done** SHALL write nothing: that occurrence was completed elsewhere. The button SHALL read the same in every shipped language as the Android app's Done.

#### Scenario: Done on a repeating task
- **WHEN** a daily task's reminder fires and the user taps **Done** on the notification
- **THEN** today's occurrence is recorded as completed, the task moves to tomorrow with its rule, and every device shows that after sync

#### Scenario: Done in the browser with the app open
- **WHEN** a push notification's **Done** is tapped while a tab of the app is open in the background
- **THEN** that tab completes the task, nothing new opens, and the worker writes nothing itself

#### Scenario: Done in the browser with the app closed
- **WHEN** a push notification's **Done** is tapped and no window of the app is open
- **THEN** the app opens, completes the task and removes the action from its address

#### Scenario: Done while offline
- **WHEN** the user taps **Done** on the Android notification with no network
- **THEN** the task is completed on the phone and the change is uploaded on reconnect

#### Scenario: Done on an encrypted account
- **WHEN** an encrypted account's repeating task is completed from a notification
- **THEN** the occurrence record's title leaves the device as ciphertext and the series advances

#### Scenario: Two buttons only
- **WHEN** the browser shows at most two notification buttons
- **THEN** the notification shows **Done** and **Snooze 10 min**

#### Scenario: Done on a notification for an occurrence already completed elsewhere writes nothing
- **WHEN** today's occurrence of a daily task was completed on another device and the user taps **Done** on today's notification on the phone
- **THEN** the phone writes nothing after it syncs, and the task stays on tomorrow

#### Scenario: Done from a notification waits for the first sync, up to 30 s; offline it applies at once
- **WHEN** the user taps **Done** on a notification and the app it opens is behind the server
- **THEN** Done applies once the first sync has ended, at most 30 seconds later (10 when sync never starts), to the occurrence the server is on; with no network it applies at once
