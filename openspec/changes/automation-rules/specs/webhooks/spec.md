# Spec Delta

## ADDED Requirements

### Requirement: Rule events
`rule.fired` SHALL be a subscribable event: a rule with a `webhook` action (OpenSpec `automation-rules`) that applies changes to a task SHALL queue one delivery to that webhook only, carrying the task's current state, the field changes the rule made, and `rule: {id, name}` (the name as stored, so a ciphertext string for an encrypted account). The delivery SHALL be signed, retried, logged and protected like every other event, and SHALL carry `source: "rule"`. Other webhooks subscribed to `task.updated` or `task.completed` SHALL receive those events for the rule's batch as for any batch, with `source: "rule"`.

#### Scenario: Rule sends to one webhook
- **WHEN** a rule with the action "send to webhook Home Assistant" fires on a task and the user has a second webhook subscribed to `rule.fired`
- **THEN** one `rule.fired` delivery is queued for Home Assistant and none for the second webhook

#### Scenario: Unknown webhook on the rule
- **WHEN** the webhook named by a rule's action has been deleted
- **THEN** the run is recorded as "skipped: webhook missing", the rule's other actions still apply, and nothing is queued

#### Scenario: Subscribe requires authentication
- **WHEN** a request without credentials creates a webhook subscribed to `rule.fired`
- **THEN** the response is a 401 `unauthorized` error
