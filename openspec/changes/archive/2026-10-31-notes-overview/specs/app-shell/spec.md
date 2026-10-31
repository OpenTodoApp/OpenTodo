## ADDED Requirements

### Requirement: Notes in the More group
The More group SHALL list Notes after Focus, in every "How you work" mode, opening `/notes`. Notes SHALL be promotable to the primary destinations through the sidebar destinations preference, except in Open Loops first, where it stays in More so the six primary destinations are unchanged. It SHALL show no count and no marker. The entry is navigation only and reads no server data, so it works offline.

#### Scenario: Listed in More
- **WHEN** the user opens the More group, in any mode
- **THEN** Notes is listed after Focus and opens the Notes page

#### Scenario: Promoted
- **WHEN** a Companion user turns on "Show in sidebar" for Notes in Settings → Appearance
- **THEN** Notes appears among the primary destinations on every device after sync and leaves the More group

#### Scenario: Open Loops first
- **WHEN** the same user switches to Open Loops first
- **THEN** Notes is back in the More group, the six primary destinations are unchanged, and the promotion is kept for a later switch back
