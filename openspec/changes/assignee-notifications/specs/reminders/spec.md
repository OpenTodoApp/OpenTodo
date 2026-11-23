## ADDED Requirements

### Requirement: Assignment and status pushes
A device with push enabled MAY opt in, per device, to two further pushes, both off until the user turns them on: **Assigned to me**, when someone else assigns a task to the user, and **Completed or reopened**, when someone else completes or reopens a task assigned to the user. The server SHALL send such a push after the change has committed, only to the user's subscriptions that opted in to that event, and never for a change the user made. The payload SHALL carry the task id, the name of who made the change and, for a status push, whether the task was completed or reopened; it SHALL carry the task title only when the device opted in to "include task titles", and never an encrypted title or the description. The notification SHALL name who made the change, show the task's title when the payload or the device's local store has it, be in the language stored on the device, and open the task when clicked. While the app is in front on the device, no system notification SHALL be shown for these pushes. They are best effort: one that cannot be sent is not retried. The choices are stored with the device's push subscription (`POST /api/v1/push/subscriptions` takes `notify: {assigned, status}`), outside the op log and the export, and are removed with it.

#### Scenario: Assigned while the app is closed
- **WHEN** Ben assigns "Book the venue" to Ana and Ana's laptop has push enabled with "Assigned to me" on
- **THEN** the laptop shows "Ben assigned you a task" with "Book the venue", and clicking it opens that task

#### Scenario: Not opted in
- **WHEN** Ana's phone has push enabled but "Assigned to me" off and Ben assigns her a task
- **THEN** no push is sent to the phone, and the bell still shows the assignment

#### Scenario: Completed by a teammate
- **WHEN** Ben completes a task assigned to Ana and her device opted in to "Completed or reopened"
- **THEN** the device shows "Ben completed a task", and reopening it later shows "Ben reopened a task"

#### Scenario: Own change
- **WHEN** Ana completes a task assigned to herself
- **THEN** no status push is sent to any of her devices

#### Scenario: Titles not opted in
- **WHEN** the device opted in to "Assigned to me" without "include task titles"
- **THEN** the payload carries no title, and the notification shows the title read from the device's local store when it has the task

#### Scenario: Encrypted account
- **WHEN** the task's title is end-to-end encrypted and the device opted in to titles
- **THEN** the payload carries no title

#### Scenario: Choices need push on this device
- **WHEN** push is off on this device
- **THEN** Settings does not offer "Assigned to me" or "Completed or reopened"

#### Scenario: Subscribing with the choices
- **WHEN** an authenticated device posts its subscription with `notify: {"assigned": true}`
- **THEN** the response carries `notify: {"assigned": true, "status": false}` and the device receives assignment pushes

#### Scenario: Unauthenticated subscription
- **WHEN** the subscription request carries no valid session or token
- **THEN** the response is 401 with code `unauthenticated` and nothing is stored

#### Scenario: Invalid choices
- **WHEN** the posted `notify` is not an object of booleans
- **THEN** the response is 400 with code `bad_request` and the stored subscription is unchanged
