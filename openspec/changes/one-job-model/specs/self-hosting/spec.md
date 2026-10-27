## ADDED Requirements

### Requirement: Background jobs run when their work is due
The process that runs the background jobs SHALL start each job when its work is due instead of on a fixed timer, and SHALL wake a job at once when the server queues work for it. Each job SHALL run at most once at a time and independently of the others, so a long backup never delays a delivery. A job that is still due right after it ran SHALL wait a retry pause before it runs again. A job SHALL be asked again for its next due time at least every 30 seconds, and within about 2 seconds after another server process on the same data directory wrote to the database. Upkeep without a deadline (database statistics, delivery log size limits, the rule run log, orphaned secrets) SHALL run at most hourly and only after something changed. No job SHALL start later than the fixed timers it replaces would have started it:
- webhook and notification channel deliveries: queued ones at once, retries at their scheduled time;
- reminder pushes: at the firing time;
- weekly digests: at the chosen hour;
- automation rule events: at once; time triggers: at the minute of the occurrence;
- calendar subscription fetches, calendar sync cycles and issue connection polls: at their next due time;
- scheduled backups: at the scheduled time, a run missed while stopped at startup.

#### Scenario: Webhook queued while idle
- **WHEN** a task change queues a webhook delivery while the jobs runner is sleeping
- **THEN** the delivery is sent without waiting for any poll interval

#### Scenario: Reminder at its firing time
- **WHEN** a reminder fires at 09:00:00 and its device subscribed to push
- **THEN** the push is sent at 09:00:00 (within a second), not on the next 30-second tick

#### Scenario: Failing delivery does not spin
- **WHEN** a reminder push fails with a transient error and the reminder stays due
- **THEN** the reminder job waits 30 seconds before it tries again, also when other work wakes it

#### Scenario: Idle server
- **WHEN** a self-hosted server has no queued deliveries, no due reminders and no other due work for an hour
- **THEN** it runs no job during that hour except checking when work is next due and noticing other processes' writes

#### Scenario: Long backup
- **WHEN** a scheduled backup uploads for ten minutes and a webhook delivery is queued meanwhile
- **THEN** the delivery is sent at once

#### Scenario: Write served by the other process during a rolling update
- **WHEN** during a rolling update the process that does not run the jobs saves a task change that queues a webhook delivery
- **THEN** the process that runs the jobs sends it within a few seconds, exactly once, and the other process sends nothing
