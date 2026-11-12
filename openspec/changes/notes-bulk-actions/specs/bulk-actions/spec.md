## ADDED Requirements

### Requirement: Selection on the Notes page
The selection of this capability SHALL also be available on the Notes page in List mode, for standalone notes the user may write, with the note actions of `notes-page` "Actions on ticked notes" instead of the task actions. The keys shared with task lists (`x`, Space, `Shift+↓`/`↑`, `Ctrl`/`⌘`+`A`, Escape, `.`, `Shift+L`, Delete, `Ctrl`/`⌘`+`Z` while the toast shows) SHALL mean the same there, and the keys the Notes page adds (`m`, `p` on ticked notes) SHALL be registered in its scope without a conflict. Selection SHALL stay device state and never be synced.

#### Scenario: Same keys
- **WHEN** a user who ticks tasks with `x` and opens the Actions menu with `.` does the same on the Notes page
- **THEN** standalone notes are ticked and the note Actions menu opens

#### Scenario: Registry has no conflict
- **WHEN** the shortcut registry test runs
- **THEN** `m` and `p` on the Notes page conflict with no other key of that scope or of the global scope
