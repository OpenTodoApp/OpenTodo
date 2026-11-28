## ADDED Requirements

### Requirement: Distinguish edit and schedule during a swipe
On rows that support touch title editing, the revealed short and full swipes toward the start of the line SHALL identify their actions with distinct icons, localized labels and theme tints. The short swipe SHALL show a pencil, **Edit** and the informational tint. The full swipe SHALL show a calendar, **Schedule** and the accent tint.

#### Scenario: Short swipe edits the title
- **WHEN** a user releases a short swipe on an editable phone list row
- **THEN** the list opens and focuses the inline title editor without another tap
- **AND** the revealed edge identifies the action with a pencil, **Edit** and the informational tint

#### Scenario: Full swipe opens scheduling
- **WHEN** the user continues the swipe past the scheduling threshold and releases
- **THEN** the edge switches to a calendar, **Schedule** and the accent tint and the date sheet opens on release

#### Scenario: Save a title offline
- **WHEN** the user saves a title while offline
- **THEN** the edit is recorded by the existing task title operation and follows its normal sync and convergence rules
