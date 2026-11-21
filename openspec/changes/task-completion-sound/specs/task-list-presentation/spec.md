## ADDED Requirements

### Requirement: Audio feedback for a completed task

While **Task completion sound** is on, a successful user-initiated completion in the foreground SHALL request one short, locally generated cue. A completed occurrence, a parent with descendants or a bulk completion SHALL produce at most one cue for the action. Playback SHALL work offline when allowed by the playback host and SHALL leave task data and its convergence unaffected. Reopen, Undo, rejected or no-op actions, automation and changes received through sync SHALL produce no cue. Playback SHALL never delay or fail the task operation. There SHALL be no queued cue when a client is hidden or audio is unavailable.

#### Scenario: Complete a recurring occurrence or a parent
- **WHEN** the opted-in user checks a recurring occurrence or completes a parent with open subtasks in the foreground
- **THEN** the action produces one cue regardless of how many task records change

#### Scenario: Finish several selected tasks
- **WHEN** the opted-in user completes a selection containing open tasks
- **THEN** the successful bulk action produces one cue

#### Scenario: Completion from another client
- **WHEN** a task completion arrives through sync or an automation
- **THEN** rows and counts update according to the existing rules and no cue plays

#### Scenario: Sound unavailable
- **WHEN** the audio host blocks playback during a task completion
- **THEN** completion and Undo work as usual and the sound is skipped
