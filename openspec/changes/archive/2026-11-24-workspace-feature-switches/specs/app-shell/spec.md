## ADDED Requirements

### Requirement: Destinations of features that are off
The sidebar (its primary destinations, the More group or menu, the phone drawer and the Notes space switch) and Settings → Appearance → Sidebar SHALL leave out every destination of a feature the current workspace has off (`workspaces` "Workspace features"): Notes, Calendar, Habits, Focus, Routines, Review and Statistics, and Locations. A promoted destination of such a feature SHALL be left out without changing the stored promotion, and SHALL come back in its place when the feature is turned on or another workspace is current. This works offline from the cached workspace.

#### Scenario: Calendar off
- **WHEN** the current workspace has Calendar off
- **THEN** the sidebar's primary destinations are Inbox, Today and Upcoming, and `sidebar_order` is unchanged

#### Scenario: Promoted Focus
- **WHEN** a user promoted Focus and switches to a workspace with Focus off
- **THEN** Focus is not in the sidebar nor in Appearance → Sidebar, and switching back shows it promoted again

#### Scenario: Notes off
- **WHEN** the current workspace has Notes off
- **THEN** the sidebar shows no Tasks and Notes switch, and the Tasks space is shown
