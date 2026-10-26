## ADDED Requirements

### Requirement: The panel slot stays in place while it fills
When the open panel shows "No task selected" and a task is chosen, the panel SHALL stay on screen at its width at every moment until the task shows, so the list beside it never widens and narrows again. Showing that task SHALL NOT replay the panel's slide-in, which belongs to opening from closed. This holds after going to another list, on a first selection, and while the task is still being read from the device. It changes no data, so it needs no network.

#### Scenario: First task after changing projects
- **WHEN** a user with the side panel opens "Home", goes to the project "Work" so the panel reads "No task selected", and clicks the title of "Order the tiles"
- **THEN** the panel is on screen at its width in every frame until "Order the tiles" shows in it, the list's width never changes, and the panel does not fade or slide in

#### Scenario: Opening from closed still slides in
- **WHEN** the side panel is closed and the user presses Enter on a selected task
- **THEN** the panel opens with that task and slides in from its edge, as "Overlay motion" describes

#### Scenario: A task that does not exist
- **WHEN** the panel reads "No task selected" and a link to a task that was deleted is opened
- **THEN** the empty pane stays in place and no task panel appears
