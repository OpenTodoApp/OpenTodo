# Spec Delta

## ADDED Requirements

### Requirement: Focus in the More group
The More group SHALL list Focus after Statistics, in every "How you work" mode, opening `/focus`. Focus SHALL be promotable to the primary destinations through the sidebar destinations preference, except in Open Loops first, where it stays in More. It SHALL show no count and no marker.

#### Scenario: Listed in More
- **WHEN** the user opens the More group, in any mode
- **THEN** Focus is listed after Statistics and opens the Focus screen with today's focus or the task picker

#### Scenario: Promoted
- **WHEN** a Companion user turns on "Show in sidebar" for Focus in Settings → Appearance
- **THEN** Focus appears among the primary destinations on every device after sync and leaves the More group

#### Scenario: Open Loops first
- **WHEN** the same user switches to Open Loops first
- **THEN** Focus is back in the More group, the six primary destinations are unchanged, and the promotion is kept for a later switch back
