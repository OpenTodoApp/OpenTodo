## ADDED Requirements

### Requirement: Commands of features that are off
The palette SHALL NOT offer a command of a feature the current workspace has off (`workspaces` "Workspace features"): its Go to commands, and the commands that start or open it (New note, Open today's note, New frame, New slot, New habit, Start focus, New routine, Run routine, Run routine on this note, Describe a routine, Close the day, Re-plan the rest of the day, Set the location). Search over tasks, projects, labels and notes of the workspace SHALL be unchanged, and the commands SHALL come back when the feature is on.

#### Scenario: Routines off
- **WHEN** the current workspace has Routines off and the user types "routine"
- **THEN** neither Go to Routines, New routine nor Run routine is listed

#### Scenario: Another workspace
- **WHEN** the user switches to a workspace with Routines on
- **THEN** Go to Routines is listed again
