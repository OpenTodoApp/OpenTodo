## ADDED Requirements

### Requirement: Panes follow the available width on tablets
The app SHALL choose its panes from the width it is given, not from the device type or orientation: below 600 px the phone layout; from 600 px the task panel as an overlay over the list, with the phone's navigation below 768 px and the sidebar from 768 px; from 900 px the list and the task panel side by side, the sidebar folding to its rail while the list would keep less than 25rem. Resizing the window, entering split view or turning the device SHALL keep the open task and the list's scroll position. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: An iPad in landscape
- **WHEN** a person opens a task on an iPad in landscape (1180 px wide)
- **THEN** the sidebar, the list and the task panel are side by side

#### Scenario: Split view
- **WHEN** the same iPad puts the app in a split view half 678 px wide
- **THEN** the task stays open as an overlay panel and the list keeps its place
