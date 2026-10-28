## ADDED Requirements

### Requirement: A quick-add line can ask the assistant about the task it just created
When a device has turned on "Suggest after adding" and the assistant is available to the account (turned on by the owner, consented, not an encrypted account), a task added from a quick-add line SHALL open the assistant panel with one bounded question about that task and send it at once. The question SHALL ask for a clearer title only if it helps, the project only if clearly better and at most four subtasks only if the task is really several steps, SHALL forbid changing anything else or inventing a date, and SHALL ask for the language of the task. The answer SHALL be the usual change set, reviewed before anything is written. The switch SHALL be stored on the device and be off by default.

#### Scenario: Switch on, assistant available
- **WHEN** the switch is on and the person adds "Call garage tomorrow" in a list's quick-add line
- **THEN** the task is created, the assistant panel opens with a question about that task alone and its proposal appears for review, with every item checked and nothing applied

#### Scenario: Switch off
- **WHEN** the switch is off and the person adds a task
- **THEN** the task is created and the assistant panel does not open

#### Scenario: Assistant not available
- **WHEN** the switch is on but the owner has not enabled the assistant, the account has not consented or the account is encrypted
- **THEN** the task is created and no question is sent

#### Scenario: A failure never blocks adding
- **WHEN** the assistant status cannot be read or the question cannot be started
- **THEN** the task is still created and no error is shown for the suggestion

#### Scenario: Other ways to create tasks
- **WHEN** a task is created by import, the API, CalDAV, email or another device's sync
- **THEN** no question is sent
