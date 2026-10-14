# Spec Delta

## MODIFIED Requirements

### Requirement: Activity events derived from operations
The activity log SHALL be derived only from the operation log; no separate event is written for a data change. Each operation SHALL map to an event naming the actor, the entity, the field changed, the old and new values when known, the time and the device it came from, with consecutive operations by the same actor on the same entity within a short window folded into one event. Operations written through a public link (device `public:<link-id>`, OpenSpec `public-links`) SHALL form their own events, attributed to the link and never folded into the creator's events. Derivation SHALL give the same result on the server and on a device holding the same operations.

#### Scenario: Create folded into one event
- **WHEN** a task is created, which produces one operation per field
- **THEN** the activity shows a single "created the task" event by the actor, not one per field

#### Scenario: Meaningful field changes
- **WHEN** a task is completed, rescheduled, reassigned, moved to another project or commented on
- **THEN** each appears as a distinct event wording the change, such as "completed", "moved the due date to 2026-10-12", "assigned to Bob", "commented"

#### Scenario: Public tick next to the creator's edit
- **WHEN** the link creator reschedules a task and, two seconds later, a guest completes it through the link
- **THEN** the activity shows two events: "rescheduled" by the creator and "completed" by the public link, with the second carrying device `public:<link-id>`

#### Scenario: Same result on server and device
- **WHEN** a device holding the same operations as the server derives the events of that task
- **THEN** it derives the same two events with the same ids
