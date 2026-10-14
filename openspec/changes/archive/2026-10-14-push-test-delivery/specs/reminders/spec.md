# Spec Delta

## MODIFIED Requirements

### Requirement: Notification settings
Settings SHALL offer, per device, enabling and disabling push notifications, the "include task titles" option, and a test notification. Enabling SHALL request the browser permission and register the subscription; disabling SHALL remove the subscription on the server. Signing out SHALL remove the device's subscription.

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

## ADDED Requirements

### Requirement: Test notifications confirm arrival
A test push SHALL be shown as a system notification even while the app is in front, SHALL not replace an earlier test notification, SHALL carry no task content, and SHALL be reported back to any open window of the app on that device. Settings SHALL say "received" only after that report and, if none arrives within a short wait, SHALL say the push was accepted but not seen on this device, with likely causes.

#### Scenario: Received while the settings page is open
- **WHEN** a test push arrives on the device whose Settings started it
- **THEN** a system notification is shown even though the app is focused, and Settings reports that the notification was received on this device

#### Scenario: Accepted but not seen
- **WHEN** the push service accepted the test but no receipt reaches the page within the wait
- **THEN** Settings says the push was accepted but not seen, and suggests checking the operating system's notification settings for the browser or app, focus and do-not-disturb modes, and the installed app on iOS

#### Scenario: Repeated tests
- **WHEN** the user runs the test twice in a row
- **THEN** both runs show a notification; the second does not silently replace the first

#### Scenario: Test after the device reconnects
- **WHEN** the push service delivers a test to a device that was offline when it was sent
- **THEN** the notification is shown on arrival and no reminder, op or delivery mark is created by it, so nothing has to converge across devices

### Requirement: Push delivery checklist
Settings → Notifications SHALL show, per device, whether each condition for push holds: the browser supports push, permission is granted, the offline service worker is active, this device has a subscription on the server, the server's last send to it succeeded, and the last test was received. Every failing condition SHALL name an action that fixes it or explain why it cannot be fixed on this device.

#### Scenario: No service worker
- **WHEN** the app runs without an active offline service worker, as in a development build
- **THEN** the checklist marks the service worker step as failing, explains that push needs the installed or production app and that in-app reminders still work, and does not offer an enable action that would fail

#### Scenario: Permission blocked
- **WHEN** the browser permission for the site is denied
- **THEN** the permission step fails with instructions to allow notifications in the browser's site settings, and later steps are shown as not checked

#### Scenario: Push service failing
- **WHEN** the server's recent sends to this device's subscription failed
- **THEN** the server step fails with the last error and the failure count, and offers to re-enable notifications

#### Scenario: Offline device
- **WHEN** the device is offline while the checklist is shown
- **THEN** local steps are still checked, the server steps say they cannot be checked offline, and the test action is unavailable with an explanation

### Requirement: Push test route
`POST /api/v1/push/test` with `{deviceId}` SHALL send one test push to the caller's subscription for that device and answer 200 with an outcome: `sent`, `no_subscription`, `gone` (subscription removed) or `failed` with the push service status. It SHALL require a session or a full-access token, SHALL be limited per account, and SHALL record the send in the subscription's delivery status like a reminder push.

#### Scenario: Test delivered to the push service
- **WHEN** an authenticated user posts their device id and that device has a subscription the push service accepts
- **THEN** the response is 200 with outcome `sent` and a test id, and the subscription's last delivery time is updated

#### Scenario: Device without a subscription
- **WHEN** the posted device id has no subscription for the caller
- **THEN** the response is 200 with outcome `no_subscription` and no push is sent

#### Scenario: Subscription gone
- **WHEN** the push service answers that the subscription no longer exists
- **THEN** the response is 200 with outcome `gone`, the server removes the subscription, and the device is offered to re-enable notifications

#### Scenario: Push service rejects the message
- **WHEN** the push service answers with any other error or cannot be reached
- **THEN** the response is 200 with outcome `failed` and the status or error, and the failure is counted on the subscription

#### Scenario: Unauthenticated request
- **WHEN** the request carries no valid session or token
- **THEN** the response is 401 with the error envelope and code `unauthorized`

#### Scenario: Read-only or agent token
- **WHEN** the request is authenticated with a read or agent API token
- **THEN** the response is 403 with code `insufficient_scope` and no push is sent

#### Scenario: Missing device id
- **WHEN** the body has no device id
- **THEN** the response is 400 with code `bad_request` and no push is sent

#### Scenario: Too many tests
- **WHEN** an account sends more test pushes than the limit allows within the window
- **THEN** the response is 429 with code `rate_limited` and no push is sent

#### Scenario: Push turned off or demo instance
- **WHEN** the operator has turned push off, or the instance runs in demo mode
- **THEN** the route answers 404 `not_found` when push is off and 403 `demo_restricted` in demo mode, and no outbound request is made
