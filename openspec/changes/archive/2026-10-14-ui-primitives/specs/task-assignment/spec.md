# Spec Delta

## ADDED Requirements

### Requirement: Assignee picker ordering and search
The assignee picker SHALL follow the design-system picker rules. With an empty query it lists "Unassigned" and "You" first, then the members assigned most recently on this device, then the remaining current members by name. Typing matches names and emails by word prefix or fuzzily. Members are shown with their avatar. The options remain limited to the project's current members as specified in "Assignee on task rows and detail".

#### Scenario: Frequent assignee near the top
- **WHEN** the user often assigns tasks in a shared project to Sam and opens the assignee picker
- **THEN** Sam is listed directly after "Unassigned" and "You"

#### Scenario: Offline assignment converges
- **WHEN** the device is offline and the user assigns a task to a member from the picker
- **THEN** the assignee is written as one operation applied locally, and on reconnect the server re-checks membership and the field converges on all devices under last-writer-wins
