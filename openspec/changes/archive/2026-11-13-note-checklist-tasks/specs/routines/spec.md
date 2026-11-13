## ADDED Requirements

### Requirement: Tasks from a note link back
Create tasks SHALL take an optional input "Link back to the note", offered when its text or lines come from a Get note text step (of a task, a project or a standalone note) visible from it. When on, each created task's note SHALL start with one line linking to that source, written in the link form of `note-links` (`[title](?note=<id>)`, `?task=` or `?project=`), in the same batch as the task, so the source's Linked references list the new tasks. With a list of sources in a Repeat, each task SHALL link to the source its line came from. The source note SHALL not be rewritten by the step. On an encrypted account the step is a content step and runs on a device, as Create tasks does. The device and the server SHALL plan it identically, pinned by the shared plan fixture.

#### Scenario: Checkboxes link back
- **WHEN** the use case "Checkboxes to tasks" runs on the note "Planning meeting" with Link back to the note on, and the note has two open check-list lines
- **THEN** two tasks are created, each whose note starts with a link to "Planning meeting", and the note's Linked references list both tasks on every device after sync

#### Scenario: Without a note source
- **WHEN** a Create tasks step reads the output of Format text
- **THEN** the editor does not offer Link back to the note, and the API refuses the input on that step as invalid

#### Scenario: Offline preview
- **WHEN** the device is offline and the user tests the draft
- **THEN** the preview shows each planned task with the link line from local data
