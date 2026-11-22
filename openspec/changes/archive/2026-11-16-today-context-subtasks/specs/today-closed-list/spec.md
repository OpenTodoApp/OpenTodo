## ADDED Requirements

### Requirement: Contextual subtasks stay outside Today's slots

An open undated or future-dated subtask shown for context in the Today tree SHALL stay outside the filled and waiting slot sets. With the Today limit on, an eligible contextual subtask SHALL still be shown in the tree of a parent in an ordinary Today group while that parent holds a slot and the tree is open. Waiting for a slot SHALL keep the same tasks and counts. Contextual rows SHALL offer no slot action and SHALL never change the number of available slots. The context projection SHALL work offline from the same task data and follow sync with no stored membership or operation of its own.

#### Scenario: The last slot has contextual subtasks

- **WHEN** the limit is one, the slotted parent has two contextual subtasks and another regular task is waiting
- **THEN** the list still shows one of one slots filled and one waiting task, the parent's contextual rows have no slot actions, and completing a contextual child leaves both sets unchanged

#### Scenario: A waiting parent is admitted

- **WHEN** a parent with an undated subtask has been waiting for a slot and it enters Today's ordinary groups
- **THEN** the subtask can appear in its tree with nesting on, consuming no slot, and the Waiting group has no contextual rows

#### Scenario: Promote a contextual subtask when the limit is full

- **WHEN** a user chooses **Make top-level for today** for a contextual subtask while all slots are filled
- **THEN** it follows normal admission rules and appears in **Waiting for a slot** if no slot admits it, and Undo restores the contextual row and the prior filled and waiting sets
