# Spec Delta

## ADDED Requirements

### Requirement: The owner turns on the push relay
The server SHALL offer an owner switch, "iPhone push through the OpenTodo relay" (`push.apple_relay`), in Settings → Notifications with the server scope. The switch SHALL be off by default. The relay address (`push.apple_relay_url`) SHALL default to the project's relay and SHALL be shown under the switch only while the switch is on. The optional environment variable `OPENTODO_APPLE_RELAY` SHALL override the address only; it SHALL never turn the relay on, and SHALL have no effect while the switch is off. With push turned off on the server, the switch SHALL NOT be offered, and on a demo instance it SHALL be fixed off. While the switch is off, the server SHALL make no request to any relay, including no health probe from the delivery check, and SHALL answer the routes under `/api/v1/push/apple` with 403 `relay-off`, except `DELETE /api/v1/push/apple/{id}`, which contacts no relay and SHALL remove the registration whatever the switch says. Every request to the relay SHALL go through the server's outbound request policy, with no version in its user agent.

#### Scenario: Default
- **WHEN** a server starts with default settings
- **THEN** the switch is off, no request to any relay is ever made, and the iPhone app shows no relay setting

#### Scenario: Opting out while the switch is off
- **WHEN** the owner turned the switch off and an iPhone that registered earlier turns delivery off
- **THEN** the server deletes its registration and contacts no relay

#### Scenario: Address override alone
- **WHEN** `OPENTODO_APPLE_RELAY` is set and the owner's switch is off
- **THEN** the switch stays off, the delivery check probes no relay, and no request to the relay or to that address is made

#### Scenario: Turned on
- **WHEN** the owner turns the switch on
- **THEN** the iPhone app on that server offers delivery through the relay, and the address under the switch reads the project's relay

#### Scenario: A private address
- **WHEN** the owner sets the relay address to a private network address without allowing private targets
- **THEN** the setting is refused with the outbound policy's reason

#### Scenario: Not the owner
- **WHEN** a member who is not the owner tries to change the switch
- **THEN** the request is refused with 403 and the switch keeps its value

### Requirement: iPhone devices register through the user's server
The server SHALL offer, behind a signed-in session, `POST /api/v1/push/apple` (register or replace this device's registration), `PUT /api/v1/push/apple/{id}/schedule` (report that the device's schedule reflects the op log up to a cursor, through a time) and `DELETE /api/v1/push/apple/{id}`. These routes SHALL be denied on a demo instance. On registration the server SHALL mint a random 32-byte wake key and register the APNs token, its environment and the wake key with the relay. It SHALL store the handle, the wake key and a hash of the due token the device sent, and SHALL keep neither the APNs token nor the due token. The schedule answer SHALL say `renew` when the handle expires within 7 days. A registration SHALL be deleted with its session, when the device is revoked and when the relay answers `gone`. A user SHALL have at most 10.

The server SHALL also offer `GET /api/v1/push/apple/due`, authenticated only by the device's due token as a bearer credential. It SHALL answer the reminders of that device's user that fire from 5 minutes ago to 1 minute ahead, with id, task id and time. It SHALL include a title only when the device included titles and the account is not end-to-end encrypted, as plain text truncated to 120 characters. It SHALL be limited to 30 requests an hour per device.

Registrations are device state, not task data: they are not ops and are never synced. A registration made while the server cannot reach the relay SHALL fail and change nothing.

#### Scenario: Register
- **WHEN** a signed-in iPhone posts its APNs token, environment and due token while the owner's switch is on
- **THEN** the server registers with the relay and answers the registration id, and its database holds the handle, the wake key and the due token's hash, but not the APNs token or the due token

#### Scenario: Without a session
- **WHEN** a request to `POST /api/v1/push/apple` carries no session
- **THEN** the server answers 401 and contacts no relay

#### Scenario: Relay unreachable
- **WHEN** the relay cannot be reached during registration
- **THEN** the server answers 502 `relay-unreachable` and stores nothing

#### Scenario: Due with the device's token
- **WHEN** the notification extension calls the due route with its due token at a reminder's time
- **THEN** the server answers that reminder with its title when titles are included, and with no title for an encrypted account

#### Scenario: Due with a wrong token
- **WHEN** the due route is called with an unknown token or none
- **THEN** the server answers 401 and reveals no reminder

#### Scenario: Due route abused
- **WHEN** one device's token calls the due route a 31st time within an hour
- **THEN** the server answers 429

#### Scenario: Renewal
- **WHEN** a device reports its schedule and its handle expires in 5 days
- **THEN** the answer says `renew`, and the web app renews with a fresh token from the shell

#### Scenario: Gone
- **WHEN** the relay answers `gone` for a device
- **THEN** the server deletes that registration, and the device re-registers at its next run if delivery is still on

### Requirement: The server wakes iPhones only when it helps
For each registered iPhone the server SHALL send a `refresh` wake when an applied op adds, moves, snoozes, dismisses or deletes a reminder of that user firing within 8 days, or changes such a reminder's task, and the device's reported schedule is older than the op. The device the op came from SHALL get none, and a device SHALL get at most one every 20 minutes, with later changes sent at the window's end. At a reminder's time the server SHALL send a `due` wake to a device, one for all reminders due in the same minute and never beyond the relay's caps, only when the reminder changed after the device's reported schedule, or fires after the time that schedule reaches. A device whose schedule is current SHALL get none. A `due` that fails transiently SHALL be retried until 5 minutes after the reminder's time and then dropped. A `refresh` SHALL NOT be retried. The relay's `Retry-After` SHALL be obeyed. A failed wake SHALL never delay Web Push or delivery channels.

Wake-ups write no data. A device that missed one converges at its next background run or start, and the phone's own schedule keeps working throughout.

#### Scenario: Reminder added elsewhere
- **WHEN** a reminder due in an hour is added on a computer and the iPhone last reported its schedule this morning
- **THEN** the server sends that iPhone one `refresh` wake

#### Scenario: Many edits in a row
- **WHEN** ten reminders are edited within five minutes
- **THEN** each iPhone of that user gets one `refresh` wake for them, and at most one more at the end of the 20-minute window

#### Scenario: Schedule already current
- **WHEN** a reminder fires and the iPhone reported a schedule that includes its last change
- **THEN** no `due` wake is sent, and the phone's own notification shows it

#### Scenario: Schedule stale at the reminder's time
- **WHEN** a reminder fires that changed after the iPhone's last reported schedule
- **THEN** the server sends that iPhone one `due` wake at the reminder's time

#### Scenario: Relay down
- **WHEN** the relay answers 503 for a `due` wake
- **THEN** the server retries until 5 minutes past the reminder's time, Web Push to other devices goes out on time, and the delivery check shows the relay as unreachable after 3 days of failures

### Requirement: Push delivery setting in the iPhone app
In the iPhone app, when the shell lists `apple-push`, the server offers push and the owner turned the relay on, Settings → Notifications SHALL offer "Deliver on time through the OpenTodo relay". The setting sits next to the device's notification switch and is off until the user turns it on. Turning it on SHALL register the device, with task titles included or not as the device's "include task titles" option says. Turning it off SHALL remove the registration and the due token. With notifications through the app off on the device, it SHALL be off too. The setting is per device, stored on the device and never synced. A failed registration SHALL leave it off with the reason. Reminders scheduled on the phone SHALL be unaffected either way.

#### Scenario: Turn it on
- **WHEN** the user turns the setting on and allows notifications
- **THEN** the device is registered, the setting reads On after a reload, and the next due reminder arrives with the app force-quit

#### Scenario: Offline
- **WHEN** the user turns it on without a connection to the server
- **THEN** the setting stays off and says the server could not be reached, and nothing is registered

#### Scenario: Notifications denied
- **WHEN** the user declines the notification prompt
- **THEN** the setting stays off and says notifications are blocked for OpenTodo

#### Scenario: The owner has not turned the relay on
- **WHEN** the owner's switch is off
- **THEN** the row is not shown, and reminders scheduled on the phone work as before

## MODIFIED Requirements

### Requirement: Push delivery setting in the Android app
In the Android app, when the shell lists the `push` capability (OpenSpec `native-shells`) and the server offers push, Settings → Notifications SHALL offer delivery through UnifiedPush, next to the device's notification switch and off until the user turns it on. Turning it on SHALL let the user choose the UnifiedPush app and SHALL subscribe the device on the server with task titles included or not as the device's "include task titles" option says; turning it off SHALL remove the subscription and the registration. The row SHALL say plainly when no UnifiedPush app is installed and SHALL then offer no switch. With notifications through the app turned off on the device, push delivery SHALL be off too. The setting is per device, stored on the device, and never synced; a failed subscription SHALL leave it off with the reason, and reminders scheduled on the phone SHALL be unaffected either way.

#### Scenario: Turn it on
- **WHEN** the user turns on delivery through UnifiedPush and chooses a UnifiedPush app
- **THEN** the device is subscribed on the server, the setting reads On after a reload, and the next due reminder arrives with the app closed

#### Scenario: No UnifiedPush app
- **WHEN** the Android app can use UnifiedPush but none is installed
- **THEN** the row says a UnifiedPush app is needed and offers no switch that would fail

#### Scenario: The server does not offer push
- **WHEN** push is turned off on the server
- **THEN** the row is not shown, and reminders scheduled on the phone work as before

#### Scenario: Offline
- **WHEN** the user turns it on without a connection to the server
- **THEN** the setting stays off and says the server could not be reached, and nothing is registered

#### Scenario: Titles
- **WHEN** "include task titles" is off on the device
- **THEN** the device is subscribed without content and a pushed reminder shows the generic text

#### Scenario: iPhone and browsers
- **WHEN** the app runs on an iPhone, or in a browser
- **THEN** the UnifiedPush row is not shown: the iPhone app has its own relay setting, and a browser keeps its own push switch
