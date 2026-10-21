# Spec Delta

## ADDED Requirements

### Requirement: Rules for encrypted accounts
For an encrypted account the device SHALL encrypt a rule's `name` and the text of its `comment` action; a rule's `trigger`, `condition` and the other `actions` SHALL stay plaintext (ids, dates and enumerations only), so the server evaluates and applies rules for an encrypted account exactly as for any other. The server SHALL NOT write a comment for an encrypted account (it cannot produce a ciphertext body): the editor and the API SHALL refuse the `comment` action for an encrypted account, and the engine SHALL record a rule carrying one as "skipped: encrypted" for that action while applying the rest. A rule's in-app notification and its run log SHALL name tasks by id, resolved on the device.

#### Scenario: Rule works on ciphertext
- **WHEN** an encrypted account's rule "label waiting added → move to Waiting, priority 3" fires on a task whose title the server cannot read
- **THEN** the task is moved and re-prioritised like any other, the server having read only ids and numbers

#### Scenario: Comment action refused
- **WHEN** an encrypted account PATCHes a rule with `actions: {comment: {text: "noted"}}`
- **THEN** the response is 409 `encryption_enabled` naming the action and nothing is written

#### Scenario: Turning encryption on with such a rule
- **WHEN** a user turns encryption on while a rule with a comment action exists
- **THEN** the rule keeps running its other actions, the comment is skipped and logged, and the Rules page marks the action as unavailable
