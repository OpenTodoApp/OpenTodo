# Spec Delta

## MODIFIED Requirements

### Requirement: Reminders scheduled on the device
A shell SHALL deliver reminders without a push service: the web app, while it runs in the shell, SHALL hand the shell the reminders due in the next 7 days (reminder id, task id, firing time, and the title and the due text only when the device's "include task titles" option is on and the account is not encrypted) whenever they change, and the shell SHALL schedule each as an exact alarm and show a system notification at its time, titled from the handed-over title or a generic text in the device's language, with the handed-over due text as its body (OpenSpec `reminders` "The notification names the due") or the generic body without one. The due text SHALL be written by the web app in the user's language and formats as of the day the reminder fires, so it is right when it shows; a reminder delivered by push SHALL take the due text of the same reminder in the device's schedule. The shell SHALL refresh the schedule at least hourly by running the web app briefly in the background, so a reminder created on another device fires on this one. A notification SHALL offer Snooze 10 min and Dismiss, which SHALL act through the web app's own reminder operations (opened in the background), and a tap SHALL open the task. The schedule, the handed-over titles and due texts SHALL be stored only in the app's private storage and SHALL be deleted on sign-out, on lock of an encrypted account and when the server is changed.

#### Scenario: Reminder fires with the app closed
- **WHEN** a reminder is due at 15:00, the app was last open at 14:00 and is closed
- **THEN** the phone shows a notification at 15:00 with the task's title (or the generic text), without any push service being involved

#### Scenario: The due under the title
- **WHEN** a reminder fires at 9:00 for "Call the plumber", due today at 9:30, with titles on
- **THEN** the notification is titled "Call the plumber" and its body reads "Today 09:30" in the user's language and time format

#### Scenario: Reminder set on another device
- **WHEN** a reminder for 18:00 is created on the user's laptop at 16:00 and the phone's app stays closed
- **THEN** the phone has scheduled it by 17:00 at the latest and shows the notification at 18:00

#### Scenario: Snooze from the notification
- **WHEN** the user taps Snooze 10 min on the notification
- **THEN** the reminder's firing time moves by ten minutes as one reminder operation that reaches every device, and the notification shows again ten minutes later

#### Scenario: Encrypted account
- **WHEN** the account uses end-to-end encryption and the device is unlocked
- **THEN** the handed-over schedule carries no titles and no due texts, the notification reads the generic text, and the task opens decrypted on tap

#### Scenario: Locked device
- **WHEN** the user locks the encrypted account on the device
- **THEN** the shell deletes its schedule and shows no reminder until the device is unlocked again
