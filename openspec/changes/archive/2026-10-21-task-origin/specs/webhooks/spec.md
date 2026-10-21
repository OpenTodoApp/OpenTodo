# Spec Delta

## MODIFIED Requirements

### Requirement: Payload and signature
Each delivery SHALL be an HTTPS or HTTP POST with a JSON body containing a unique delivery id, the event name, the event time, the entity's current state and the list of changed fields with their previous values when known, and SHALL carry headers for the event name, the delivery id, the webhook id, a timestamp and a signature `v1=<hex HMAC-SHA256 of "<timestamp>.<body>">` computed with the webhook's secret. The payload format SHALL be versioned and documented. A task's `origin` SHALL travel in the entity state and in `changes` like every other field, as the ciphertext string for an encrypted account.

#### Scenario: Receiver verifies a delivery
- **WHEN** a receiver recomputes the HMAC over the timestamp header and the raw body with the shared secret
- **THEN** it equals the signature header, and a delivery whose timestamp is older than the receiver's tolerance can be rejected as a replay

#### Scenario: Payload content
- **WHEN** a task's priority changes from 4 to 1 through the API
- **THEN** the `task.updated` body contains the full task with priority 1 and `changes: {"priority": {"from": 4, "to": 1}}`

#### Scenario: Captured task delivered
- **WHEN** a task is created from a shared issue page and the device syncs
- **THEN** the `task.created` body's task carries `origin: {kind: "issue", provider: "github", id: "o/r#7", url: "…"}` and `changes.origin` reads `{"from": null, "to": {…}}`, so a receiver can link the task back to the issue without a second request
