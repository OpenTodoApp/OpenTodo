# Spec Delta

## MODIFIED Requirements

### Requirement: Monthly look
The app SHALL offer a Monthly look at `/review/monthly`, reachable from the Review screen's menu, the Loop home and the command palette, with three steps:
- **Areas:** each live top-level project that has child projects or whose flow is Area (project-flow "Areas"), with its number of child projects and how many of them are without a next action or stalled; an area without child projects reads "Area" instead of the count.
- **Old someday:** Someday tasks created more than 90 days ago, with the Someday step's keys.
- **Trend:** the last four weeks' completed, created and slipped counts, with the definitions of Statistics.

"Finish monthly look" SHALL write its time on the user's `review` entity with the same sync, offline, export and convergence rules as the weekly review.

#### Scenario: Areas with stalled children
- **WHEN** the top-level project Home has four child projects, one stalled and one without a next action
- **THEN** Areas lists Home with "4 projects, 2 need attention", and opening it lists the two

#### Scenario: An area without sub-projects
- **WHEN** the top-level project Finances has the Area flow and no child projects
- **THEN** Areas lists Finances, reading "Area"
