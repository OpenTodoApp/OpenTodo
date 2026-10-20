# Spec Delta

## MODIFIED Requirements

### Requirement: Private network policy shared with calendar subscriptions
The owner's "allow private network targets" setting SHALL also govern the URLs of calendar subscriptions (OpenSpec `calendar-feeds`) and the hosts of issue connections (OpenSpec `issue-connections`), with the same address rules, the same check at creation and at every fetch or poll, and the same connection to the checked address. Settings SHALL say next to the toggle that it applies to webhooks, calendar subscriptions and issue connections.

#### Scenario: One toggle, two features
- **WHEN** the owner enables private network targets
- **THEN** a webhook to `http://192.168.1.10:8123/`, a calendar subscription to `http://192.168.1.5/family.ics` and an issue connection to `https://gitlab.lan/` are all accepted, and disabling the toggle makes the next fetch of that subscription and the next poll of that connection fail with `private_target`

#### Scenario: Member reads the policy
- **WHEN** a member opens the Calendar feeds or the Issues panel while private targets are not allowed
- **THEN** adding a subscription or a connection on the local network is refused with a message naming the owner setting
