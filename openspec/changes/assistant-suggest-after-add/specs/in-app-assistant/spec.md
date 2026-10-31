## ADDED Requirements

### Requirement: The agent loop and its step budget
A server turn SHALL run one model conversation with read tools against synced data and write tools that only plan, checking the stop reason before content is used. A tool-use answer SHALL run its tools and continue; a turn SHALL stop with stop reason `round_limit` when its conversation reaches 12 model calls, with no change set. Refusal SHALL show "The model declined this request." with no partial content and no change set, and truncation SHALL mark the answer as cut off without proposing changes.

#### Scenario: A long multi-step request finishes
- **WHEN** a task needs several tool rounds and the model stops with `end_turn` on the 12th model call
- **THEN** the turn ends with the change set it planned, not `round_limit`

#### Scenario: The budget is reached
- **WHEN** the model calls a tool on the 12th model call
- **THEN** the turn ends with `round_limit`, no tool results are sent and no change set is proposed

#### Scenario: A single call over the registry's own per-call limit
- **WHEN** one `schedule_tasks` call names 70 tasks
- **THEN** the tool answers a tool error and the turn does not write from it

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
