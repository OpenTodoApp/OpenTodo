## ADDED Requirements

### Requirement: Urgent reminders ring as alarms on Android
The Android app SHALL ring an urgent reminder it was handed as an alarm at its firing time: a notification on its own **Urgent reminders** channel that plays the phone's alarm sound on the alarm stream and repeats it until the reminder is answered, with the handed-over title or the generic text and **Done**, **Snooze 10 min** and **Dismiss**, and a full-screen alarm over the lock screen with the same three buttons where Android allows full-screen notifications. Each button SHALL silence the alarm and apply the same action as the reminder notification's button, through the web app's own operation; swiping the notification away SHALL only silence it. An urgent reminder SHALL be armed as an exact alarm clock when the app may set exact alarms and inexactly otherwise. The app SHALL open Android's settings pages for exact alarms (Android 12 and later) and then for full-screen notifications (Android 14 and later) only when the user turns **Urgent** on in the visible app, only for a permission that is missing and at most once per device for each, never at launch, at a hand-over or from a background run. Without the full-screen permission the alarm SHALL be a heads-up notification that still rings; without notifications nothing SHALL ring. The app SHALL NOT ask for Do Not Disturb access: the alarm sounds where the user's Do Not Disturb rules let alarms through. Alarms SHALL survive a reboot and follow the schedule like every reminder; a hand-over SHALL NOT silence an alarm that is ringing, and **Change server** SHALL. Nothing here changes task data; an action applies the reminder's own operation, offline first and synced like any reminder action.

#### Scenario: An urgent reminder with the phone locked
- **WHEN** an urgent reminder is due at 07:00, the phone is locked, exact alarms and full-screen notifications are allowed and the app is closed
- **THEN** at 07:00 the screen turns on with the task's title and the alarm sound repeats until the user taps Done, Snooze 10 min or Dismiss

#### Scenario: Snooze from the alarm offline
- **WHEN** the user taps Snooze 10 min on the alarm while the phone is offline
- **THEN** the alarm stops, the reminder's firing time moves by ten minutes as one reminder operation applied on the phone and synced later, and the alarm rings again ten minutes later

#### Scenario: Turning Urgent on asks once
- **WHEN** the user marks a reminder urgent for the first time in the visible app on Android 14, with neither exact alarms nor full-screen notifications allowed
- **THEN** Android's Alarms & reminders page opens, and when the user comes back the full-screen notifications page opens; marking another reminder urgent later opens neither

#### Scenario: Full-screen notifications refused
- **WHEN** an urgent reminder fires and full-screen notifications are not allowed
- **THEN** it shows as a heads-up notification that rings on the alarm stream until it is answered

#### Scenario: Do Not Disturb
- **WHEN** an urgent reminder fires while Do Not Disturb lets alarms through
- **THEN** it rings; under Total silence it does not sound

#### Scenario: After a reboot
- **WHEN** the phone restarts with an urgent reminder armed for later
- **THEN** the alarm is armed again and rings at its time

#### Scenario: The hand-over while it rings
- **WHEN** an urgent reminder's alarm is ringing and the app hands the schedule over again, which no longer lists the reminder
- **THEN** the alarm keeps ringing until the user answers or swipes it away
