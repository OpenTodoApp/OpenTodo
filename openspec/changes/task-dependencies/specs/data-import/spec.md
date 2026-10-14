# Spec Delta

## ADDED Requirements

### Requirement: Dependencies from imported files
An own export SHALL round-trip `blocked_by` with the original ids. A format that carries blocking relations between rows of the same file SHALL map them onto `blocked_by` of the imported tasks, written after every task of the job exists so no reference is refused; a relation to a row outside the file, or one that would close a cycle, SHALL be dropped with a per-row warning. Undo of the job SHALL leave no dangling blocker visible.

#### Scenario: Own export round trip
- **WHEN** an export in which "Book flights" is blocked by "Confirm dates" is imported into an empty account
- **THEN** the imported "Book flights" is blocked by the imported "Confirm dates", and a fresh export lists the same `blocked_by`

#### Scenario: Relation to a row outside the file
- **WHEN** a row names a blocking relation to an identifier that is not in the file
- **THEN** the task is imported without that blocker and the preview row carries a warning naming the relation

#### Scenario: Offline device converges
- **WHEN** the import finishes while a device is offline and it later syncs
- **THEN** it receives the `blocked_by` operations like any other and shows the same blocked tasks
