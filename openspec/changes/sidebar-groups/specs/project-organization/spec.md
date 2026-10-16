# Spec Delta

## MODIFIED Requirements

### Requirement: Collapse and expand
Each project with sub-projects SHALL be collapsible in the sidebar. Collapse state SHALL be a per-device preference that persists across reloads and is not synced. On a device that has never stored a collapse state, every project with sub-projects SHALL start collapsed. It SHALL be toggled by pointer and by keyboard (Left collapses, Right expands, when a project row is focused), and the Projects header menu SHALL offer "Collapse all" and "Expand all". Navigating to a sub-project SHALL expand its ancestors so the current project is visible.

#### Scenario: Collapse persists locally
- **WHEN** the user collapses "Work" and reloads the app
- **THEN** "Work" is still collapsed on that device and remains expanded on other devices

#### Scenario: Keyboard toggle
- **WHEN** a project row with sub-projects has focus and the user presses Left, then Right
- **THEN** its sub-projects are hidden and then shown again

#### Scenario: Roots only on a new device
- **WHEN** the user signs in on a device for the first time with thirty projects in eleven top-level projects
- **THEN** the sidebar lists the eleven top-level projects, those with sub-projects collapsed with their subtree open-task counts, and a device that already stored a collapse state keeps it

#### Scenario: Collapse all
- **WHEN** the user chooses "Collapse all" from the Projects header menu while "Work" and "Home" are expanded
- **THEN** every project with sub-projects is collapsed on this device, "Expand all" opens them all again, and other devices are unaffected

#### Scenario: Navigation still reveals
- **WHEN** everything is collapsed and the user opens "Designer" from the command palette
- **THEN** "Work" and "Hiring" expand so "Designer" is visible and selected, and the other roots stay collapsed
