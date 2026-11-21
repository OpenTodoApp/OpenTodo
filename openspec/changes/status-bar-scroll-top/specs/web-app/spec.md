## ADDED Requirements

### Requirement: Scroll to the top on request from the shell
When the shell sends the scroll-to-top event, the page SHALL scroll its frontmost scroller to the top: an open sheet or panel when there is one, otherwise the page's main scroller, smoothly unless reduced motion is on. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: An open task panel
- **WHEN** the scroll-to-top event arrives while a task's panel is open over the list
- **THEN** the panel scrolls to its top and the list keeps its place
