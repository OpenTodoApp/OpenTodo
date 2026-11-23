## ADDED Requirements

### Requirement: A drag holds the page and scrolls at its edges
While a touch hold on a row is armed or its drag is lifted, the page SHALL NOT scroll with the finger, on iOS as elsewhere; a touch that is not held SHALL scroll as before. While a drag is lifted and the pointer rests near the top or bottom edge of the list or the sidebar, that region SHALL scroll towards the edge, faster nearer it, until it reaches its end or the pointer leaves the edge, and the drop indicator SHALL follow the rows under the pointer. This applies to touch, mouse and pen. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: Hold and move on an iPhone
- **WHEN** a person on an iPhone holds a task, then moves it down the list
- **THEN** the task follows the finger and the list stays where it is

#### Scenario: A place off screen
- **WHEN** a person drags a task to the bottom edge of a long list and keeps the finger there
- **THEN** the list scrolls until the place they want is under the finger, and dropping there places the task

#### Scenario: A sidebar project
- **WHEN** a person drags a sidebar project to the top edge of a scrolled sidebar
- **THEN** the sidebar scrolls up and the project can be dropped above the projects that were hidden
