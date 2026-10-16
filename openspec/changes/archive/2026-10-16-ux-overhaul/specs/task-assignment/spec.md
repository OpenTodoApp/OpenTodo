# Spec Delta

## MODIFIED Requirements

### Requirement: Assigned to me view
The client SHALL offer an "Assigned to me" view listing the user's open assigned tasks across all projects, grouped by project, reachable from the sidebar's More group and a `g`-prefixed keyboard shortcut, with a live count. The sidebar entry SHALL be shown only when the user is a member of at least one shared project or has at least one assigned task; the view SHALL stay reachable by address and shortcut. The view SHALL be rendered from local storage so it works offline and updates as soon as synced assignments arrive.

#### Scenario: Open the view offline
- **WHEN** the user opens the app without a network and navigates to Assigned to me
- **THEN** every open task assigned to them that was present at the last sync is listed under its project

#### Scenario: Completing from the view
- **WHEN** the user completes a task from Assigned to me
- **THEN** the task leaves the view and the sidebar count decreases without a reload

#### Scenario: Solo install
- **WHEN** a user has no shared project and no assigned task
- **THEN** the sidebar shows no Assigned to me entry, and `g a` still opens the view with its empty state

### Requirement: Show in Assigned to me
In a scope where the user is the only assignable account, the Assignee property SHALL not be shown in the task panel by default; the panel's Add menu SHALL offer "Show in Assigned to me", which assigns the task to the user, and the resulting Assignee chip SHALL offer to remove it, each as one ordinary assignee operation applied locally first, working offline and converging by last-writer-wins. The Assigned to me view SHALL keep listing only explicitly assigned tasks.

#### Scenario: Pin a personal task to Assigned to me
- **WHEN** the user picks "Show in Assigned to me" from the Add menu of an Inbox task while offline
- **THEN** the task appears in Assigned to me at once, and on the user's other devices after sync

#### Scenario: Implicit You is not listed
- **WHEN** the user has ten unassigned tasks in an unshared project
- **THEN** Assigned to me does not list them and their panels show no Assignee chip
