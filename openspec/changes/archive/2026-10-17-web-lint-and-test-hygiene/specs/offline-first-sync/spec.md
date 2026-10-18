## ADDED Requirements

### Requirement: Notification actions share the device clock
Changes written outside the open app on the device, such as Snooze and Dismiss on a reminder notification, SHALL be stamped with the same corrected clock as the app's own edits. When such a change is uploaded without the app and is refused, or the answer is not the server's, it SHALL stay queued for the app's next sync. Offline, it is applied and queued as any other edit; convergence follows last-writer-wins.

#### Scenario: Device clock an hour slow
- **WHEN** the app has found the device clock an hour behind the server and the user snoozes a reminder from its notification with the app closed
- **THEN** the change is stamped about an hour later than the device clock reads, after the device's last stamp, like an edit made in the app

#### Scenario: Refused upload
- **WHEN** the notification action uploads its change itself and the server refuses one of its operations as stamped too far ahead
- **THEN** that operation stays queued on the device, the accepted ones leave the queue, and the app's next sync stamps it again and sends it

#### Scenario: Answer from a proxy
- **WHEN** the upload is answered with a page that is not a sync response
- **THEN** every operation of the change stays queued on the device

#### Scenario: Offline
- **WHEN** the user dismisses a reminder from its notification while the device is offline
- **THEN** the reminder is dismissed on the device and the change waits in the queue for the next sync
