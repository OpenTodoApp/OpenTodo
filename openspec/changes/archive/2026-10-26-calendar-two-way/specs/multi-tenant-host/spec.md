# Spec Delta

## ADDED Requirements

### Requirement: Calendar sync on the shared scheduler
On a host, calendar sync cycles SHALL run on the shared scheduler with the calendar subscriptions' entry: a tenant SHALL be opened for them only while its owner switch is on and one of its connections is due, and a task change in a tenant SHALL refresh the tenant's entry so the debounced cycle runs.

#### Scenario: Tenant without connections
- **WHEN** a tenant has calendar sync on but no connection
- **THEN** the scheduler never opens it for calendar sync

#### Scenario: Debounced cycle
- **WHEN** a user of an open tenant moves a task that has an event
- **THEN** the tenant's calendars entry becomes due within about 20 seconds and the cycle runs
