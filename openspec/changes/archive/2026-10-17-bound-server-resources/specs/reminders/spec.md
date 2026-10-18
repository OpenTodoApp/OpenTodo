## ADDED Requirements

### Requirement: Bounded push delivery
The scheduler SHALL send reminders for several accounts at a time (eight), so one account's slow or unreachable push endpoints never hold back other accounts' reminders, and one account's sends in one pass SHALL take at most 20 seconds, the rest being sent on the next pass while the reminder is less than an hour overdue. Delivery is still recorded as a server op (`delivered_at`) that converges on every device like any other; a device that was offline shows the reminder from its own copy.

#### Scenario: Slow endpoints of one account
- **WHEN** one account's push endpoints hang and another account has a reminder due in the same pass
- **THEN** the other account's reminder is pushed without waiting for the hanging endpoints

#### Scenario: Budget spent
- **WHEN** an account's sends in one pass take longer than its budget
- **THEN** its remaining sends wait for the next pass and the reminder is not yet recorded as delivered

### Requirement: Bounded push subscriptions
An account SHALL hold at most 20 push subscriptions; registering a device beyond that SHALL replace the subscription registered least recently. A subscription whose last 20 sends failed and that delivered nothing for a day SHALL no longer be sent to until the device registers it again. Subscriptions are server state, not ops; nothing changes for offline devices.

#### Scenario: Too many devices
- **WHEN** an account with 20 subscriptions registers another device
- **THEN** the new subscription is stored and the least recently registered one is removed

#### Scenario: Dead subscription
- **WHEN** a subscription's last 20 sends failed and it has delivered nothing for a day
- **THEN** reminders are no longer sent to it, and registering it again from the device sends to it once more
