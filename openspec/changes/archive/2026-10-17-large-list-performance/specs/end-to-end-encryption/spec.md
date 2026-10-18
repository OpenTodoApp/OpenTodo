## ADDED Requirements

### Requirement: Re-write job reads incrementally

The re-write job that runs when encryption is turned on or off SHALL read each batch from where the previous batch stopped, in primary-key order, so the rows it reads grow linearly with the size of the store. Progress and resumption are unchanged: an interrupted job resumes after the last re-written row, also after going offline, and the re-written values converge through the operation log as before.

#### Scenario: Turning encryption on with many tasks

- **WHEN** encryption is turned on with 2,000 tasks (ten batches)
- **THEN** each task is read a fixed few times during the job, not once per batch

#### Scenario: Interrupted job resumes

- **WHEN** the job stops after one batch and runs again
- **THEN** it continues after the last re-written row and every row is re-written exactly once
