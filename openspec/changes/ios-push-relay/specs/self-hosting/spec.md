# Spec Delta

## MODIFIED Requirements

### Requirement: No telemetry
The server and client SHALL make no network requests to third parties and SHALL collect no usage data, with two exceptions: the map provider, and the model provider a user of an encrypted account set up for the on-device assistant while the owner allows it. The only outbound requests the server makes SHALL be to destinations the owner or a user explicitly configured (such as a backup destination or a webhook endpoint, or the push relay once the owner turned it on, OpenSpec `push-relay`) and, while maps are on, to the map provider (OpenStreetMap-based by default, changeable or turned off by the owner, OpenSpec `task-locations`). None of them SHALL carry usage data beyond the configured payload; map requests SHALL carry no account information, and requests to the push relay SHALL carry only these fields, with no server version: a registration, a device's APNs token, its environment and a wake key the server minted; a wake, a device's opaque handle, the kind of wake-up, its time and its signature. The browser SHALL never contact the map provider directly, and SHALL contact a model provider only for an on-device assistant turn or connection test the user started.

#### Scenario: Network audit
- **WHEN** the app is used for a session with the network inspected, no integration is configured and no map is shown
- **THEN** every request goes to the server's own origin

#### Scenario: Only configured destinations
- **WHEN** the owner has configured a backup destination, has turned maps off, and the server's outbound traffic is inspected
- **THEN** every outbound request goes to that destination and to nothing else

#### Scenario: Maps on by default
- **WHEN** a server with default settings shows a user a task's map and the server's outbound traffic is inspected
- **THEN** the only outbound requests besides configured destinations go to the default map tile provider, carry no cookie, token or user address, and the browser's own requests all go to the server's origin

#### Scenario: On-device assistant
- **WHEN** an encrypted user with the on-device assistant set up for Anthropic uses the app without asking the assistant anything
- **THEN** the browser sends no request to Anthropic

#### Scenario: Push relay off by default
- **WHEN** a server with default settings has iPhone users with reminders and its outbound traffic is inspected
- **THEN** no request goes to any push relay

#### Scenario: Push relay registration
- **WHEN** the owner turned the push relay on and an iPhone user turns on delivery through it
- **THEN** the server's one request to the relay carries the APNs token, its environment and a wake key, and no due token, task, title, account or server version

#### Scenario: Push relay turned on
- **WHEN** the owner turned the push relay on and a reminder changes for a registered iPhone
- **THEN** the server's request to the relay carries a handle, a kind, a time and a signature, and no task, title, account or server version
