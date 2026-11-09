## ADDED Requirements

### Requirement: The iOS first-run screen shows the address it uses
The iOS app's first-run screen SHALL show the scheme of the address it will open. An address typed without a scheme SHALL be reached over `https` and SHALL appear in the field as the `https://` origin the app uses once the person leaves the field or connects, never only internally. Plain `http` SHALL be used only when typed, and while a local `http` address is in the field the screen SHALL say that the connection is not encrypted. A host name typed in Unicode SHALL be sent in its ASCII (Punycode) form on every supported iOS version. The Connect button SHALL look and be active as soon as the address is well-formed and SHALL look and be inactive, also to VoiceOver, while it is empty or unusable. After connecting, Settings → About SHALL show the exact server address the app uses under the app's own row. The check SHALL request only the address shown and SHALL NOT follow redirects; nothing on this screen touches task data, so it has no offline or convergence behaviour of its own.

#### Scenario: No scheme typed
- **WHEN** the person types `todo.example.com` and taps Connect
- **THEN** the field shows `https://todo.example.com` and the health check goes to that https address only

#### Scenario: Local http typed on purpose
- **WHEN** the person types `http://192.168.1.20:8080`
- **THEN** the screen says the connection is not encrypted and Connect is active

#### Scenario: Connect follows the address
- **WHEN** the field is empty or holds `not an address`
- **THEN** Connect is drawn and announced as inactive, and it becomes active once the field holds a well-formed address

#### Scenario: The address after connecting
- **WHEN** a connected person opens Settings → About in the iOS app
- **THEN** the "OpenTodo for iOS" row shows the server address the app opened, such as `https://todo.example.com`
