## ADDED Requirements

### Requirement: A task's menu opens complete
A task's actions menu (right-click, touch hold, a row's More button, the keyboard and the Selection bar) SHALL first be shown with every item it holds for its tasks, so it is placed once: no item SHALL appear after the first paint because a read the items depend on was still running, and the panel SHALL NOT move after it is shown unless its anchor or the viewport changes.

#### Scenario: Right-click shows the whole menu at once
- **WHEN** the user right-clicks an open task in the Inbox on a 1280 px screen
- **THEN** the menu's first paint already holds Add to focus, Start tracking and Start focus above Complete, and it stays where it first appeared
