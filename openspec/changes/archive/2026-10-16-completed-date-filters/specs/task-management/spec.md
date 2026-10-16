# Spec Delta

## ADDED Requirements

### Requirement: Who completed a task
A task SHALL record in `completed_by` the account id of whoever completed it, or null when unknown. Every write that completes a task SHALL set it in the same batch as the completion time, and every reopen SHALL clear it. Server writes on a user's behalf SHALL set it to that user; public link ticks SHALL record null. It SHALL be an ordinary, unencrypted task field: written offline, synced, converged by last-writer-wins with the completion time, and exported.

#### Scenario: Completed on a device
- **WHEN** a signed-in user completes a task while offline and the device later syncs
- **THEN** the task has `completed_by` set to that user's id on every device and in `GET /api/v1/tasks/{id}`

#### Scenario: Reopen clears it
- **WHEN** the user reopens a completed task
- **THEN** `completed_at` and `completed_by` are both null

#### Scenario: Recurring occurrence
- **WHEN** a user completes a task with `every day`
- **THEN** the completed occurrence record carries `completed_by` with that user's id and the series stays open without it

#### Scenario: Completed through the API
- **WHEN** a script PATCHes `{"completed_at": 1760264400000}` with a user's token
- **THEN** the stored task has `completed_by` set to that user's id

#### Scenario: Concurrent completions converge
- **WHEN** two members complete the same task on two devices while offline and both sync
- **THEN** every device shows the same `completed_at` and the `completed_by` written in the same batch as it
