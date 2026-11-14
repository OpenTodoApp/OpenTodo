# Spec Delta

## ADDED Requirements

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
- **THEN** the row is not shown: the iPhone app has no push, and a browser keeps its own push switch
