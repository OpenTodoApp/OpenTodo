## ADDED Requirements

### Requirement: Dependency checks cost one graph read per batch
When the server checks the blocked_by ops of a sync batch for cycles, it SHALL read each sharing scope's dependency graph at most once per batch and SHALL account for the batch's own accepted blocked_by ops under last-writer-wins, so the cost of a batch does not multiply by the size of the project. Which ops are accepted or refused SHALL be the same as when the graph is read for every op. Devices are unaffected: offline edits arrive in batches as before and converge the same way.

#### Scenario: Large batch on a large project
- **WHEN** a device sends one batch of 1,000 blocked_by ops for a project of 10,000 tasks
- **THEN** the server reads the project's dependency graph once and answers in well under a second on ordinary hardware

#### Scenario: Cycle closed inside the batch
- **WHEN** a batch adds the edges of a chain and, last, an edge that closes it into a cycle
- **THEN** every edge but the last is applied and the last is refused with `cycle`

#### Scenario: Older op in the batch does not clear a stored edge
- **WHEN** a batch holds an op that empties a task's blocked_by with a timestamp older than the stored value, followed by an op that would close a cycle through the stored edge
- **THEN** the first op does not win and the second is refused with `cycle`
