## MODIFIED Requirements

### Requirement: Private network protection
The server SHALL refuse webhook targets, at creation and again at every delivery after resolving the host name, whose address is loopback, link-local, unique-local or private, multicast, unspecified, or a cloud metadata address, unless the owner enabled "allow private network targets" in Settings or through the optional `OPENTODO_WEBHOOKS_ALLOW_PRIVATE=true` preset. Even with private targets allowed, the server SHALL refuse unspecified and "this network" addresses, link-local addresses and the cloud metadata addresses, also when embedded in an IPv6 address; this applies to every feature that follows the switch. Connections SHALL be made to the address that was checked, and redirects SHALL not be followed.

#### Scenario: Private target refused by default
- **WHEN** a user creates a webhook pointing at `http://192.168.1.10:8123/...` and the owner has not allowed private targets
- **THEN** the response is a 400 `private_target` error explaining the owner setting

#### Scenario: Owner allows the local network
- **WHEN** the owner enables private targets and the same webhook is created
- **THEN** it is accepted and deliveries reach the LAN receiver

#### Scenario: Metadata stays refused
- **WHEN** the owner enables private targets and a member creates a webhook, calendar subscription or notification channel whose host resolves to `169.254.169.254`
- **THEN** it is refused with `private_target` and no connection is made

#### Scenario: Host name changes to a private address later
- **WHEN** a public host name of an existing webhook starts resolving to a private address and private targets are not allowed
- **THEN** the delivery is marked failed with reason `private_target` and no connection is made

#### Scenario: Member cannot change the policy
- **WHEN** a member calls `PUT /api/v1/settings/webhooks`
- **THEN** the response is a 403 `forbidden` error

## ADDED Requirements

### Requirement: Hand-started sends are limited
Test sends and redeliveries SHALL share a limit of 30 per account per hour. Beyond it both routes SHALL answer 429 `rate_limited` without sending; scheduled deliveries and other accounts SHALL be unaffected. Both routes keep requiring a session or a full token.

#### Scenario: Limit reached
- **WHEN** a user has started 30 test sends and redeliveries within an hour and asks for another test
- **THEN** the response is 429 `rate_limited` and nothing is sent

#### Scenario: Signed out
- **WHEN** a request without credentials asks for a test send
- **THEN** the response is 401 `unauthorized` and nothing is counted
