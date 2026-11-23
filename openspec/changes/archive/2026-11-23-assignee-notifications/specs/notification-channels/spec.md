## MODIFIED Requirements

### Requirement: Channel events
Each channel SHALL receive only the events switched on for it, at least one of these:

| Event | When |
|---|---|
| `reminder` | a reminder fires |
| `assigned` | someone else assigned a task to the user |
| `mentioned` | someone mentioned the user in a comment or in notes |
| `unblocked` | someone else completed the last blocker of a task assigned to the user |
| `page` | a guest replied on or completed one of the user's task pages |
| `status` | someone else completed or reopened a task assigned to the user |

An event SHALL be queued for a channel after the change that caused it has committed on the server, at most once per channel. A channel that is switched off queues nothing. Events caused by the user themselves are never sent to them.

#### Scenario: Assigned by a teammate
- **WHEN** Ben assigns a task to Ana and Ana has an enabled channel with `assigned`
- **THEN** one message is queued for that channel and none for Ana's channels without `assigned`

#### Scenario: Same event twice
- **WHEN** the same assignment reaches the channels twice
- **THEN** the channel still receives one message

#### Scenario: Channel switched off
- **WHEN** a channel's enabled switch is off while a reminder fires
- **THEN** nothing is queued for it

#### Scenario: Completed by a teammate
- **WHEN** Ben completes a task assigned to Ana and Ana has an enabled channel with `status`
- **THEN** one message is queued for that channel naming Ben and the task

#### Scenario: Status is off for a new channel
- **WHEN** Ana adds a channel without choosing its events and Ben then completes a task assigned to her
- **THEN** nothing is queued for that channel
