# Spec Delta

## ADDED Requirements

### Requirement: Reminder times in the user's format
The reminder field SHALL show and accept reminder dates and times in the user's date and time formats (OpenSpec `date-time-preferences`), and SHALL use the same date and time controls as the due field. Reminder toasts SHALL use the same formats. When a device builds a push notification's text from its local copy of the task, it SHALL format the due date and time with the user's preferences as stored on that device, and SHALL fall back to the browser locale when it has none.

#### Scenario: Reminder in day-month and 24-hour format
- **WHEN** the date format is `day-month`, the time format is `24h`, and the user adds an absolute reminder for 3 November at 9:00
- **THEN** the reminder list shows a date like `Tue 3 Nov, 09:00` and the stored firing time is the matching instant

#### Scenario: Push text uses the preference
- **WHEN** the time format is `12h`, the date format is `month-day`, and a push arrives for a task due 2026-11-03 at 15:00 that the device has stored locally
- **THEN** the system notification reads `Due Nov 3, 3:00 PM` instead of `Due 2026-11-03 15:00`

#### Scenario: Offline preference change applies to the next notification
- **WHEN** the user switches the time format to `24h` while offline and a reminder fires in the app
- **THEN** the reminder toast shows the time on a 24-hour clock
