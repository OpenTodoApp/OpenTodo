# Spec Delta

## ADDED Requirements

### Requirement: Edit proposals in every shape
In the calendar, outline and map shapes, every proposed item SHALL offer the same edits as in the list. In the calendar shape, a proposed item SHALL also move to another day or time by dragging or with the keyboard, changing its proposed date. An edited item is marked edited and its edited values apply. Edits work offline and apply as one batch that converges like any applied proposal.

#### Scenario: Drag to another day
- **WHEN** the user drags a proposed task from Tuesday to Wednesday in the calendar shape and applies
- **THEN** the task is due Wednesday and the item was marked edited

### Requirement: Proposals that grow over turns
While a proposal is open and unapplied, a new turn SHALL send it with the request, and the assistant SHALL amend it: adding, changing or dropping items. The card SHALL show the amended proposal and mark what the latest turn changed. Applying applies the amended proposal as one batch.

#### Scenario: Also add a task
- **WHEN** a proposal moves 3 tasks and the user writes "also add a task to call the plumber"
- **THEN** the card shows the 3 moves and the new task, the new task marked as added in this turn

#### Scenario: Open proposal too large
- **WHEN** the open proposal sent with a turn has more than 50 items
- **THEN** the turn route answers 413 `too_large` and no provider request is made
