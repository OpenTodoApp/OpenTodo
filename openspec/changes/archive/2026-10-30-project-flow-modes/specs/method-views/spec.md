# Spec Delta

## MODIFIED Requirements

### Requirement: Actionable tasks and a project's next action
A task SHALL be actionable for a user when it meets all of the following:
- it is live, open and top-level
- it is in a live, unarchived project in which the user may edit tasks
- it is available (project-flow "Available tasks"): not blocked by an open task, not waiting in sequence, and with a start that is neither Someday nor a date after the user's local date
- it is unassigned or assigned to that user

A project's next action SHALL be its first actionable task in the project's list order (sections in their order, tasks in their manual order within a section, tasks without a section first). These SHALL be computed from local rows on the device, with no field or operation of their own, and SHALL change as soon as the underlying rows change on any device and sync. A task that waits in sequence SHALL NOT be listed in the Waiting view and SHALL NOT count as a waiting task of its project.

#### Scenario: First in order
- **WHEN** project Garage has, in order, a completed task, "Buy brackets" blocked by "Measure wall", and "Measure wall"
- **THEN** Garage's next action is "Measure wall"

#### Scenario: Blocker completed elsewhere
- **WHEN** another device completes "Measure wall" and the change syncs
- **THEN** Garage's next action becomes "Buy brackets" without any write on this device

#### Scenario: Assigned to someone else
- **WHEN** the only open task of a shared project is assigned to Ana
- **THEN** the project has no next action for the current user, and the task is listed in Waiting

#### Scenario: Sequential project in Next
- **WHEN** the sequential project "Move house" has "Book van", "Pack kitchen" and "Hand over keys" open, in that order
- **THEN** Next lists only "Book van" for it, Waiting lists none of the three, and completing "Book van" in Next shows "Pack kitchen" in its place

## ADDED Requirements

### Requirement: Areas are never without a next action
A project whose flow is Area (project-flow "Areas") SHALL never be listed as without a next action: not in the weekly review's project walk and summary, not in the Loop home's Place count and not in the weekly email digest. Its tasks SHALL still be actionable and appear in Next under the same rules as a parallel project's, and it SHALL still be marked stalled under the stalled rule. The web app and the server SHALL agree, checked by cases in the shared next-action vectors.

#### Scenario: Empty area
- **WHEN** the area "Finances" has only completed tasks
- **THEN** it is not listed as without a next action in the review, on the Loop home or in the digest

#### Scenario: Area turned back into a project
- **WHEN** the user sets "Finances" to Parallel on another device and this device syncs
- **THEN** "Finances" is listed as without a next action again, with no write on this device
