## MODIFIED Requirements

### Requirement: Routine webhook step
A routine's Send a webhook step SHALL queue one `rule.fired` delivery to the one webhook it names, which must belong to the run-as user and be enabled, carrying `rule: {id, name}`, `source: "rule"` and `routine: {run_id, step_id, text, task_ids}` with the step's text (when given) and the ids of the tasks it was given (at most 500), and the task's state only when exactly one task was given. The delivery SHALL be signed, retried, logged and protected like every other. A deleted or disabled webhook makes the step unavailable, and the run fails at it. A new Send a webhook step SHALL be given the data that flows to it, as other steps' main input is: the task that triggered an event routine, or the tasks a step above it found.

#### Scenario: Morning list to Home Assistant
- **WHEN** a routine finds today's tasks, formats "{a} tasks today" and sends it to the webhook Home Assistant
- **THEN** one delivery is queued to Home Assistant with the text and the task ids, and none to any other webhook

#### Scenario: Webhook disabled
- **WHEN** the named webhook is disabled before the run
- **THEN** the run fails at that step with reason `no_webhook` and nothing is queued

#### Scenario: A task-triggered routine
- **WHEN** a person adds a Send a webhook step to a "When a task is due" routine and the routine runs for one task
- **THEN** the delivery's `task_ids` holds that task's id and the delivery carries its state
