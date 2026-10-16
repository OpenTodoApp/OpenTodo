# Spec Delta

## MODIFIED Requirements

### Requirement: Push payload privacy
A push payload SHALL contain only the reminder id, the task id and the firing time, unless the subscribing device opted in to include task content; it SHALL never contain the task description. The device SHALL build the notification text from its local copy of the task when available and SHALL fall back to a generic text otherwise. Its texts SHALL be in the interface language stored on that device (OpenSpec `localization`), else English.

#### Scenario: Default payload
- **WHEN** a device subscribed without opting in and a push for "Call the dentist" is delivered
- **THEN** the payload carries no task title, and the notification shows the title read from the device's local store

#### Scenario: Opt-in payload
- **WHEN** a device subscribed with "include task titles" enabled
- **THEN** the payload carries the task title so the notification is complete even before the device has synced that task

#### Scenario: Notification in the user's language
- **WHEN** the language stored on the device is German, the date format is `day-month` and a push arrives for a task due 2026-11-03 at 15:00
- **THEN** the notification body reads `Fällig 3. Nov., 15:00` and its actions read `10 Min. später` and `Verwerfen`

#### Scenario: No language stored
- **WHEN** the device's local store has no preferences row, as on a database written by an older release
- **THEN** the notification texts are English
