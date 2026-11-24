## ADDED Requirements

### Requirement: Urgent reminders ring as alarms on iPhone
The web app SHALL mark each urgent reminder it hands the shell (`urgent: true`, absent otherwise). On iOS 26 and later the iPhone app SHALL schedule an urgent reminder whose firing time is still ahead as a system alarm (AlarmKit) instead of a notification: it SHALL ring at the firing time with the handed-over title or the generic text, offer **Stop** and **Snooze 10 min**, and Snooze SHALL open the app on the reminder's snooze address so the web app moves the reminder through its own operation. Stop SHALL only silence the alarm. The app SHALL ask for the alarm permission only while it is visible and only when it is handed an urgent reminder, never at launch, from a background run or again after the user answered. An urgent reminder SHALL be an ordinary notification when the phone runs an earlier iOS, when alarms are not allowed or not asked yet in a background run, when the app was built without AlarmKit, or when it is handed over at its firing time. Alarms SHALL follow the schedule: a reminder that is no longer urgent, moved, dismissed, completed or deleted SHALL have its alarm cancelled or moved at the next hand-over, notifications refused or turned off in the app SHALL cancel every alarm, and sign-out, a locked encrypted account and a changed server SHALL cancel every alarm. Nothing here changes task data or needs the network.

#### Scenario: An urgent reminder with the phone locked
- **WHEN** an urgent reminder is due at 07:00, the phone runs iOS 26, alarms are allowed and the app is closed
- **THEN** the phone rings at 07:00 with the task's title until the user taps Stop or Snooze 10 min

#### Scenario: Snooze from the alarm
- **WHEN** the user taps Snooze 10 min on the alarm
- **THEN** the app opens, the reminder's firing time moves by ten minutes as one reminder operation that reaches every device, and the alarm rings again ten minutes later

#### Scenario: First urgent reminder
- **WHEN** the user marks a reminder urgent for the first time in the visible iPhone app
- **THEN** iOS asks to allow alarms; after Allow the reminder is an alarm, after Don't Allow it stays a notification and the app does not ask again

#### Scenario: Older iOS
- **WHEN** the phone runs iOS 18 and a reminder is urgent
- **THEN** it arrives as an ordinary notification, with Done, Snooze 10 min and Dismiss

#### Scenario: No longer urgent
- **WHEN** the user clears Urgent on a reminder that the phone has armed as an alarm and the app hands the schedule over
- **THEN** the alarm is cancelled and the reminder is scheduled as a notification at the same time

#### Scenario: Sign-out
- **WHEN** the user signs out on the iPhone with an alarm armed
- **THEN** the alarm is cancelled and nothing rings
