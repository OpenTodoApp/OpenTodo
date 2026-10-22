## MODIFIED Requirements

### Requirement: Notification settings
Settings SHALL offer, per device, enabling and disabling push notifications, the "include task titles" option, and a test notification. Enabling SHALL request the browser permission and register the subscription; disabling SHALL remove the subscription on the server. Signing out SHALL remove the device's subscription. On a device running in a native shell with the `reminders` capability (OpenSpec `native-shells`), the same switch SHALL enable and disable the shell's device-scheduled reminders instead of a push subscription, the test action SHALL show a notification through the shell and report that outcome, and "include task titles" SHALL govern the titles handed to the shell; no push subscription SHALL be created on such a device.

#### Scenario: Enable on this device
- **WHEN** the user enables notifications and grants the browser permission
- **THEN** the device is subscribed, the test action shows a notification, and the setting reads as enabled after a reload

#### Scenario: Permission denied
- **WHEN** the browser permission is denied
- **THEN** the setting stays off with an explanation and reminders are still delivered in-app

#### Scenario: Test reports the server's outcome
- **WHEN** the user runs the test on a subscribed device
- **THEN** a real push is sent to this device through the push service and Settings shows the outcome reported by the server, never a success message the device cannot back up

#### Scenario: Test without a subscription
- **WHEN** the user runs the test on a device that has no subscription on the server
- **THEN** Settings says this device is not subscribed, offers to enable notifications, and does not claim a notification was sent

#### Scenario: Enable in the Android app
- **WHEN** the user enables notifications in the Android app and grants Android's notification permission
- **THEN** no push subscription is created, the shell is handed the coming reminders, the test action shows a notification through the shell within a few seconds, and the setting reads as enabled after a reload

#### Scenario: Android permission refused
- **WHEN** the user refuses Android's notification permission
- **THEN** the setting stays off, Settings explains where to allow notifications for the app, and reminders are still delivered in-app
