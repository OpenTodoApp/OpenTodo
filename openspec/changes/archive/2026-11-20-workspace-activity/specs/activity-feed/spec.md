## ADDED Requirements

### Requirement: Several kinds and time tracking in the feed
The feed's kind filter SHALL accept several kinds at once, an event being listed when it has any of them, in the Updates view and in `GET /api/v1/activity` (`kind` as a comma-separated list; a single kind keeps working as before). The categories SHALL gain `time` (time tracked or changed), listed after rescheduled. Filters SHALL still not affect unread counts.

#### Scenario: Two kinds in Updates
- **WHEN** the user chooses Completed and Commented in Updates
- **THEN** completions and comments are listed, and the sidebar counts are unchanged

#### Scenario: A single kind as before
- **WHEN** a client requests `GET /api/v1/activity?kind=commented`
- **THEN** the answer is the same as before this change
