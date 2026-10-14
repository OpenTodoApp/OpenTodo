# Spec Delta

## ADDED Requirements

### Requirement: Calendar feed URL events
The server SHALL record `calendar_feed.created`, `calendar_feed.rotated` and `calendar_feed.revoked` with the acting account, in the transaction of the change, and SHALL list them in the user's own activity. The feed secret, its URL and the URLs of calendar subscriptions SHALL never be recorded.

#### Scenario: Feed created
- **WHEN** a user creates their task feed URL
- **THEN** the log contains `calendar_feed.created` with the user as actor and no secret or URL in its details

#### Scenario: Rotation visible to the user
- **WHEN** a user rotates the feed and later reads `GET /api/v1/me/activity`
- **THEN** the `calendar_feed.rotated` event is listed with its time

#### Scenario: Subscriptions are not audited
- **WHEN** a user adds or deletes a calendar subscription
- **THEN** no audit event is recorded, as for webhooks
