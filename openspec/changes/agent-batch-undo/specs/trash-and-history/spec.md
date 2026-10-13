## ADDED Requirements

### Requirement: Undo of assistant writes is labelled in history
History entries whose device starts with `agent-undo:` SHALL carry the `device_label` "Undo of AI assistant (<token name>)" when the viewer owns the token and it still exists, otherwise "Undo of AI assistant", with the undoing user as author. Labels are computed when history is read; no op changes and history stays online-only. Restoring a value from such an entry SHALL be an ordinary op that converges like any edit.

#### Scenario: Owner sees the undo
- **WHEN** Alice undid her token "Desk assistant"'s reschedule and opens the task's history online
- **THEN** a change group labelled "Undo of AI assistant (Desk assistant)" shows the due date going back, after the assistant's group

#### Scenario: Other member sees a generic label
- **WHEN** Bob opens the history of the same task in a project Alice shares with him
- **THEN** the group is labelled "Undo of AI assistant" with Alice as author and no token name

#### Scenario: Unauthenticated history request
- **WHEN** a request without credentials asks for the history of a task changed by an undo
- **THEN** the response is 401 `unauthorized`

### Requirement: Undo an assistant change from history
For a change group made by one of the viewer's own assistant tokens, the history route SHALL add the call's id, and the timeline SHALL offer "Undo this assistant change", opening the same preview as Settings for that whole call. Other members SHALL not see the action. It needs a connection like history itself.

#### Scenario: Undo from a task's history
- **WHEN** Alice opens the history of a task her assistant rescheduled together with 4 others and chooses "Undo this assistant change"
- **THEN** the preview lists all 5 tasks of that call and confirming restores them

#### Scenario: Not offered to other members
- **WHEN** Bob opens the history of that task in the shared project
- **THEN** the group shows no undo action and carries no call id
