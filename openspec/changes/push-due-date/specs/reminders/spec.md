# Spec Delta

## ADDED Requirements

### Requirement: The notification names the due
A reminder's system notification SHALL be titled with the task and SHALL have as its body the task's due in the words a task row uses, as of the day the reminder fires: "Today" or "Tomorrow", the weekday within the next week, otherwise the short date (a past date too), each followed by the time when the due has one, in the user's language and date and time formats. There SHALL be no "Due" prefix. A habit with a tiny version SHALL keep the tiny version as its body, and a task without a due date SHALL keep the generic text. This SHALL hold for web push, for the in-app system notification of a hidden tab, and for the reminders the Android and iPhone apps show (OpenSpec `native-shells`). The text SHALL be built on the device from data it holds or was sent, so it works offline and needs nothing to converge: a due changed on another device reaches the notification once that change or a reminder recomputed from it has synced.

#### Scenario: Due today at a time
- **WHEN** a reminder fires at 13:30 for "Call the dentist", due today at 14:00, in German with the 24-hour clock
- **THEN** the notification is titled "Call the dentist" and its body reads `Heute 14:00`

#### Scenario: Due tomorrow without a time
- **WHEN** a reminder fires the day before a task due tomorrow without a time
- **THEN** the body reads `Tomorrow`

#### Scenario: Due further out
- **WHEN** a reminder fires on 14 October for a task due 3 November at 15:00, with the `day-month` date format and the 24-hour clock in English
- **THEN** the body reads `3 Nov 15:00`

#### Scenario: No due date
- **WHEN** a reminder fires for a task with no due date
- **THEN** the body is the generic reminder text

## MODIFIED Requirements

### Requirement: Push payload privacy
A push payload SHALL contain only the reminder id, the task id and the firing time, unless the subscribing device opted in to include task content; with that opt-in it SHALL also carry the task's title and due, both left out for an end-to-end encrypted account. It SHALL never contain the task description. The device SHALL build the notification text from its local copy of the task when available, else from the payload, and SHALL fall back to a generic text otherwise. Its texts SHALL be in the interface language stored on that device (OpenSpec `localization`), else English.

#### Scenario: Default payload
- **WHEN** a device subscribed without opting in and a push for "Call the dentist" is delivered
- **THEN** the payload carries no task title and no due, and the notification shows the title and due read from the device's local store

#### Scenario: Opt-in payload
- **WHEN** a device subscribed with "include task titles" enabled
- **THEN** the payload carries the task title and due so the notification is complete even before the device has synced that task

#### Scenario: Encrypted account
- **WHEN** a device of an end-to-end encrypted account subscribed with "include task titles" enabled
- **THEN** the payload carries neither the title nor the due

#### Scenario: Notification in the user's language
- **WHEN** the language stored on the device is German, the date format is `day-month` and a push arrives on 14 October for a task due 3 November at 15:00
- **THEN** the notification body reads `3. Nov. 15:00` and its actions read `10 Min. später` and `Verwerfen`

#### Scenario: No language stored
- **WHEN** the device's local store has no preferences row, as on a database written by an older release
- **THEN** the notification texts are English

### Requirement: Reminder times in the user's format
The reminder field SHALL show and accept reminder dates and times in the user's date and time formats (OpenSpec `date-time-preferences`), and SHALL use the same date and time controls as the due field. Reminder toasts SHALL use the same formats. When a device builds a push notification's text, it SHALL format the due date and time with the user's preferences as stored on that device, and SHALL fall back to the browser locale when it has none.

#### Scenario: Reminder in day-month and 24-hour format
- **WHEN** the date format is `day-month`, the time format is `24h`, and the user adds an absolute reminder for 3 November at 9:00
- **THEN** the reminder list shows a date like `Tue 3 Nov, 09:00` and the stored firing time is the matching instant

#### Scenario: Push text uses the preference
- **WHEN** the time format is `12h`, the date format is `month-day`, and a push arrives on 14 October for a task due 2026-11-03 at 15:00 that the device has stored locally
- **THEN** the system notification's body reads `Nov 3 3:00 PM` instead of `2026-11-03 15:00`

#### Scenario: Offline preference change applies to the next notification
- **WHEN** the user switches the time format to `24h` while offline and a reminder fires in the app
- **THEN** the reminder toast shows the time on a 24-hour clock
