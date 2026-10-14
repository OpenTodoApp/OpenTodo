# Spec Delta

## ADDED Requirements

### Requirement: Dependency relations
A task's `blocked_by` SHALL be served as one `RELATED-TO;RELTYPE=DEPENDS-ON` line per blocker, carrying the blocker's UID. Inbound `DEPENDS-ON` relations whose UID resolves to a task of the same calendar scope SHALL become the task's `blocked_by` through the same write path as other properties; relations that do not resolve SHALL be preserved in `ical_extra` and served back unchanged. `RELATED-TO` without a type keeps meaning the parent.

#### Scenario: Blockers served
- **WHEN** a task blocked by two tasks of the same project is fetched
- **THEN** the VTODO carries two `RELATED-TO;RELTYPE=DEPENDS-ON` lines with those tasks' UIDs and its parent relation, if any, unchanged

#### Scenario: Blocker set from a calendar client
- **WHEN** a client PUTs a VTODO with `RELATED-TO;RELTYPE=DEPENDS-ON:<uid of a task in the same calendar>`
- **THEN** the task is blocked by that task in the app after the devices' next sync

#### Scenario: Unknown relation preserved
- **WHEN** a client sends a `DEPENDS-ON` relation whose UID matches no task the user can see
- **THEN** `blocked_by` is unchanged, the line is kept in `ical_extra`, and the next fetch returns it
