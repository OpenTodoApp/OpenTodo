## MODIFIED Requirements

### Requirement: Background work scales with due work
In host mode, reminders, scheduled backups, trash retention, audit and delivery-log pruning, webhook deliveries, calendar subscription fetches, calendar sync cycles, issue connection polls, automation rules and weekly digest emails SHALL be run for a tenant only when that tenant has work due, recorded in a host-level index that each open tenant keeps current, without polling every tenant. The host SHALL use the same jobs as a self-hosted server, with the same next due times and the same work per run, so each job is described once for both modes. Upkeep that has no deadline (database statistics, log size limits, orphaned secrets) SHALL be due only after the tenant changed, so an idle tenant is never opened for it. Reminders SHALL be delivered within a few seconds of their firing time, as on a self-hosted server. Issue polls SHALL be due only while the tenant's owner switch for issue connections is on and an enabled connection's next poll time has passed.

#### Scenario: Reminder in a closed tenant
- **WHEN** a reminder is due in a tenant that is currently closed
- **THEN** the host opens that tenant, delivers the push notification within the usual delay, records the delivery through the op log, and may close the tenant again

#### Scenario: Thousands of idle tenants
- **WHEN** the host has 10,000 tenants and none has work due in the next hour
- **THEN** no tenant is opened during that hour

#### Scenario: Issue poll in a closed tenant
- **WHEN** an issue connection's poll is due in a tenant that is currently closed
- **THEN** the host opens that tenant, runs the poll under the tenant's operation limits, and may close the tenant again; a tenant whose owner switch is off is never opened for it

#### Scenario: Same job in both modes
- **WHEN** a webhook delivery fails and is scheduled for a retry
- **THEN** a host retries it at the same time a self-hosted server would, through the same delivery code
