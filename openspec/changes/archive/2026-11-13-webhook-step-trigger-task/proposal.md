# Proposal

## Why

A routine's Send a webhook step carries the ids of the tasks it was given, but its Tasks input is optional and the editor never filled it. A "When a task is due" routine with a webhook step therefore delivered `task_ids: []` and no task, although one task had triggered it (issue #1194).

## What Changes

- **A new Send a webhook step takes the data flowing to it**, like every other step's main input: the task that triggered an event routine, or the tasks found by a step above. The person can still change or clear it.
- Existing routines keep what they have; the step's Tasks can be set to **the task that triggered** in the editor.
- No change to the delivery, the server or stored routines.

## Capabilities

### Modified Capabilities

- `webhooks`: Routine webhook step, with a scenario for a task-triggered routine.

## Impact

`web/src/lib/rules/draft.ts` (`wireStep`), its test, docs/routines.md.
