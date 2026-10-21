# Spec Delta

## ADDED Requirements

### Requirement: Sample tasks never reach the digest
The digest SHALL exclude tasks marked `sample`, open or completed, from every number and list, through the same predicate as `statistics` "Excluded rows", pinned by the shared fixture.

#### Scenario: First week with samples
- **WHEN** a user's only completed tasks in the week are two sample tasks and the digest is built
- **THEN** the digest's completed count is 0, no sample task is listed, and the fixture's sample row is evaluated the same by the device and the server
