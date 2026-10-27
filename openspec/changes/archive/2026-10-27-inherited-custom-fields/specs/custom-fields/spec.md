## MODIFIED Requirements

### Requirement: Values follow the task's project
A task SHALL show and edit the fields that apply to its project only (its own and its ancestors' live definitions). A task in Inbox SHALL show no fields. When a task moves to another project, its values SHALL stay in the data unchanged and SHALL NOT be shown until the task returns to a project the field applies to. Deleting a definition SHALL hide its values without writing to any task. No value is ever repaired or removed by a display rule.

#### Scenario: Move to another project
- **WHEN** a task with Cost 120 moves from "Kitchen" to "Garden", and no field named Cost applies to "Garden"
- **THEN** the panel shows Garden's fields only, the export still carries the value, and moving the task back shows Cost 120 again

#### Scenario: Definition deleted while a value is edited offline
- **WHEN** device A deletes "Cost" while device B sets a task's Cost offline, and both sync
- **THEN** the definition is deleted on both devices, the value is kept in the task's data and not shown, and nothing is lost

## ADDED Requirements

### Requirement: Sub-projects inherit their ancestors' fields
The fields that apply to a project SHALL be the live definitions of its ancestors, farthest first, then its own, each group in position order. The ancestors are found by following parent references through live projects the person can see, stopping at a missing or deleted parent or a project already visited. The set is derived on every device, offline too, identically on device and server; nothing is written, so it converges with the project tree.

#### Scenario: A field on the parent
- **WHEN** "Scoring" defines the number field "WSJF" and has the sub-project "Topic A", which has the sub-project "Detail"
- **THEN** tasks in "Topic A" and in "Detail" show "WSJF" in the panel, as a column and as a badge, and `wsjf >= 5` matches them

#### Scenario: Value stored under the parent's field
- **WHEN** the user sets WSJF to 8 on a task in "Detail"
- **THEN** the task holds the value under the parent's field id, it reaches the user's other devices like any value, and the export shows it under that id

#### Scenario: Move a sub-project
- **WHEN** "Topic A", whose tasks hold WSJF values, is moved to the top level, offline, and later moved back under "Scoring"
- **THEN** WSJF disappears from its tasks while it is at the top level, nothing is written to the tasks, and the values show again once it is back

#### Scenario: Cycle from concurrent moves
- **WHEN** two devices move "A" under "B" and "B" under "A" offline, and both sync
- **THEN** every device and the server compute the same fields for each project, and no project is listed twice

### Requirement: Names and limits across a project tree
Names SHALL be unique, ignoring case, among the fields that apply to a project: adding or renaming a field SHALL be refused when an inherited field has the name, or when a sub-project at any depth defines one with it, naming that sub-project. The 30-field limit SHALL count own and inherited fields, and adding to a project SHALL be refused when a sub-project would pass it. A clash from a move or concurrent edits SHALL be shown, never repaired.

#### Scenario: Name used by the parent
- **WHEN** the user adds "wsjf" to "Topic A", which inherits "WSJF" from "Scoring"
- **THEN** the dialog refuses it, says the field comes from "Scoring", and keeps focus on the name

#### Scenario: Name used by a sub-project
- **WHEN** the user adds "Size" to "Scoring" while its sub-project "Topic B" defines "Size"
- **THEN** the addition is refused with a message naming "Topic B"

#### Scenario: Limit across the tree
- **WHEN** "Topic A" defines 6 fields and inherits 24, and the user adds a field to "Scoring"
- **THEN** the addition is refused with a message naming the limit and "Topic A"

#### Scenario: Clash after a move
- **WHEN** a project with its own "Size" field is moved under a project that also defines "Size"
- **THEN** both fields apply and are shown, the Fields dialog marks the clash and offers to rename the own one, and no value is changed

### Requirement: Inherited fields in the Fields dialog
A project's Fields… dialog SHALL list the inherited fields first, grouped under "From" and the defining project's name, read-only, followed by its own fields. Renaming a choice option SHALL rewrite matching values in the defining project and every sub-project at any depth, as ordinary operations; the delete confirmation SHALL count the tasks holding a value in all of them.

#### Scenario: Open the dialog of a sub-project
- **WHEN** the user opens Fields… on "Topic A"
- **THEN** the five scoring fields are listed first under "From Scoring" without edit, reorder or delete actions, and Topic A's own fields follow with their actions

#### Scenario: Rename an option used in sub-projects
- **WHEN** the choice field "Stage" of "Scoring" renames the option "Ordered" to "On order", and tasks in "Topic A" hold "Ordered"
- **THEN** those tasks are updated to "On order" as ordinary field operations, offline too, and converge like any edit

#### Scenario: Delete a field used in sub-projects
- **WHEN** the user deletes "WSJF" from "Scoring" while 12 tasks across its sub-projects hold a value
- **THEN** the confirmation states that 12 tasks hold a value, and after it the values stay in the data, hidden

### Requirement: Inherited fields and sharing
Inheritance SHALL follow only projects the person can see. A member of a shared sub-project who cannot see its parent SHALL see and edit the sub-project's own fields only, and values held under the parent's fields SHALL stay in the tasks' data, hidden for them. The dialog of a shared sub-project with inherited fields SHALL say that members see them only if they can see the defining project.

#### Scenario: Member without access to the parent
- **WHEN** the owner shares "Topic A" with a member, keeps "Scoring" private, and a task in "Topic A" holds WSJF 8
- **THEN** the member sees Topic A's own fields only, the owner still sees WSJF 8, and the member's edits leave the value in place

#### Scenario: Shared parent
- **WHEN** "Scoring" is shared with a member and the member creates a sub-project under it
- **THEN** the member's sub-project shows the scoring fields to the member

### Requirement: Inherited fields in the API and tools
The REST API SHALL accept on a task values for every field that applies to its project after the write, and SHALL refuse a create or rename of a field that breaks the name or limit rules of the project tree with 400 `invalid_input` naming the conflicting project. The assistant and MCP tools SHALL list a project's inherited fields with the id of the project that defines each.

#### Scenario: Value for an inherited field via the API
- **WHEN** a script PATCHes a task in "Detail" with `{"fields":{"<wsjf-id>":8}}`, where WSJF is defined on "Scoring"
- **THEN** the response is 200 and the task carries `"fields":{"<wsjf-id>":8}`

#### Scenario: Clash refused via the API
- **WHEN** a script POSTs a field named "Size" to "Scoring" while "Topic B" defines "Size"
- **THEN** the response is 400 `invalid_input` naming "Topic B" and nothing is written

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials patches a task's fields or creates a field
- **THEN** the response is 401 `unauthorized`

#### Scenario: Value for a field of an unrelated project
- **WHEN** a PATCH on a task in "Detail" carries a value for a field of "Garden", which is not an ancestor
- **THEN** the response is 400 `invalid_input` naming the field and nothing changes
