# Spec Delta

## ADDED Requirements

### Requirement: Private network policy shared with calendar subscriptions
The owner's "allow private network targets" setting SHALL also govern the URLs of calendar subscriptions (OpenSpec `calendar-feeds`), with the same address rules, the same check at creation and at every fetch, and the same connection to the checked address. Settings SHALL say next to the toggle that it applies to webhooks and calendar subscriptions.

#### Scenario: One toggle, two features
- **WHEN** the owner enables private network targets
- **THEN** a webhook to `http://192.168.1.10:8123/` and a calendar subscription to `http://192.168.1.5/family.ics` are both accepted, and disabling the toggle makes the next fetch of that subscription fail with `private_target`

#### Scenario: Member reads the policy
- **WHEN** a member opens the Calendar feeds panel while private targets are not allowed
- **THEN** adding a subscription on the local network is refused with a message naming the owner setting
