## ADDED Requirements

### Requirement: Reactions and note mentions form no event
Operations on a comment's reaction fields SHALL form no activity event, and a change of a task's `note_mentions` SHALL fold into the note edit it accompanies rather than form an event of its own, on the server and on the device alike, so the activity log stays about changes to the work and the shared fixture pins both behaviours.

#### Scenario: Reaction leaves no trace in activity
- **WHEN** Bob reacts with a heart to Alice's comment
- **THEN** the task's activity and the project feed show no new event, and the comment shows the reaction

#### Scenario: Mention in a note is one edit
- **WHEN** Alice edits a note and mentions Bob in it
- **THEN** the activity shows one "edited the notes" event by Alice, and nothing about the mention list
