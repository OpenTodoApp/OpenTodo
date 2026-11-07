## MODIFIED Requirements

### Requirement: Write limits
One write call SHALL change at most 50 entities; larger requests SHALL be refused with `-32602`. Each token SHALL be limited to 30 write calls per minute and 1,000 changed entities per UTC day, and all the agent tokens of one account together SHALL be limited to 60 write calls per minute and 2,000 changed entities per UTC day, so creating more tokens or connecting more clients does not raise the budget. Beyond either limit the tool error SHALL be `rate_limited` with `retry_after_seconds` and nothing SHALL change on any device; a call refused for either limit SHALL count against neither. The agent REST content routes SHALL share these counters. Read tools SHALL not count toward these limits. The counters are kept in server memory and in the server's database, so a restart does not reset them; they are not ops: offline behaviour and convergence are unaffected.

#### Scenario: Too many items
- **WHEN** an assistant calls `create_tasks` with 51 items
- **THEN** the response is a `-32602` error stating the limit of 50 and nothing is created

#### Scenario: Minute limit
- **WHEN** an `agent` token makes its 31st write call within one minute
- **THEN** the result is a `rate_limited` tool error with a positive `retry_after_seconds` and nothing changes

#### Scenario: Account minute limit across tokens
- **WHEN** a person's two agent tokens have made 60 write calls together within one minute and a third agent token of the same person makes a write call
- **THEN** the result is a `rate_limited` tool error with a positive `retry_after_seconds`, nothing changes, and another person's agent token can still write

#### Scenario: Account day limit across tokens
- **WHEN** two agent tokens of one person have changed 1,000 entities each in one UTC day and a third token of that person tries to change one more
- **THEN** the result is a `rate_limited` tool error and nothing changes until the next UTC day

#### Scenario: Restart keeps the day's budget
- **WHEN** an `agent` token changed 1,000 entities today and the server restarts
- **THEN** its next write call that changes an entity is refused with `rate_limited` until the next UTC day
