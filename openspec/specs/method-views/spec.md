# method-views Specification

## Purpose
The derived Next and Waiting views. Also the shared definitions of a project's next action, a project without a next action and a stalled project, which the web app and the server's weekly digest compute identically from synced rows.

## Requirements

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

### Requirement: Projects without a next action
A project SHALL be without a next action for a user when it is live and unarchived, the user may edit its tasks, and it has no actionable task, no waiting task and no deferred task. The weekly review, the Loop home and the weekly email digest SHALL use this one definition. The web app and the server SHALL be checked against one shared set of test vectors.

#### Scenario: Only Someday tasks
- **WHEN** project "Learn Italian" has two open tasks, both parked in Someday
- **THEN** it is listed as without a next action

#### Scenario: Only a deferred task
- **WHEN** project "Passport" has one open task that starts next March
- **THEN** it is not listed as without a next action

#### Scenario: Digest and app agree
- **WHEN** the digest is built for a user on their review day
- **THEN** its "projects without a next action" are the same projects the review shows on any of that user's synced devices

### Requirement: Stalled projects
A project SHALL be stalled for a user when it has at least one open live task, no task in it was completed in the last 21 days, and its oldest open task was created more than 21 days ago. Stalled SHALL be computed on the device, never stored, and shown as a marker on the project in the review's project walk and as a count on the Loop home.

#### Scenario: Stalled
- **WHEN** project Taxes has open tasks created in August and no completion since September 1, and today is October 18
- **THEN** Taxes is marked stalled

#### Scenario: New project
- **WHEN** a project's tasks were all created 5 days ago and none is completed
- **THEN** it is not stalled

### Requirement: Next view
The app SHALL offer a Next view at `/next`, reachable from the More group, the command palette, `g` then `Shift+N` and the Loop home, and choosable as a start view and as a promoted sidebar destination. It SHALL list each project's next action, grouped by context label with tasks without a context under "Anywhere", with the project shown on each row and the usual row and list shortcuts. Completing a next action SHALL replace it with the project's following next action. The view SHALL work offline.

#### Scenario: Complete and continue
- **WHEN** the user completes "Measure wall" in Next with `c`
- **THEN** "Buy brackets" appears for Garage in its context group

#### Scenario: Empty
- **WHEN** no project has a next action
- **THEN** the empty state names the action "Add a next step to a project" and offers the review's project walk

### Requirement: Waiting view
The app SHALL offer a Waiting view at `/waiting`, reachable from the More group, the command palette, `g` then `Shift+W` and the Loop home, and choosable as a start view and as a promoted sidebar destination. It SHALL list every live open task that the user can see and that is blocked by an open task or assigned to someone other than the user. Tasks SHALL be grouped by assignee name, then "Blocked by another task". Each row SHALL show its project and, for blocked tasks, the first open blocker. The view SHALL work offline and reflect remote changes live.

#### Scenario: Delegated in triage
- **WHEN** the user delegates "Fix the tap" to Ana from inbox triage
- **THEN** "Fix the tap" is listed in Waiting under Ana

#### Scenario: Blocker done
- **WHEN** a task's only blocker is completed on another device and the change syncs
- **THEN** the task leaves Waiting and becomes actionable

### Requirement: Areas are never without a next action
A project whose flow is Area (project-flow "Areas") SHALL never be listed as without a next action: not in the weekly review's project walk and summary, not in the Loop home's Place count and not in the weekly email digest. Its tasks SHALL still be actionable and appear in Next under the same rules as a parallel project's, and it SHALL still be marked stalled under the stalled rule. The web app and the server SHALL agree, checked by cases in the shared next-action vectors.

#### Scenario: Empty area
- **WHEN** the area "Finances" has only completed tasks
- **THEN** it is not listed as without a next action in the review, on the Loop home or in the digest

#### Scenario: Area turned back into a project
- **WHEN** the user sets "Finances" to Parallel on another device and this device syncs
- **THEN** "Finances" is listed as without a next action again, with no write on this device

### Requirement: Maintenance projects are not flagged
A project in maintenance (project-organization "Maintenance status") SHALL never be stalled and never be listed as without a next action: not in the weekly review's project walk and summary, not in the Loop home's Place count and not in the weekly email digest. Its tasks SHALL stay actionable under the usual rules and appear in Next. These SHALL be derived on the device and on the server from synced rows, with no write, and the web app and the server SHALL agree, checked by cases in the shared next-action vectors.

#### Scenario: Low-burn project without a next step
- **WHEN** "Garden" is in maintenance, has only Someday tasks and its oldest open task is two months old
- **THEN** it is neither stalled nor without a next action in the review, on the Loop home or in the digest

#### Scenario: Next action still listed
- **WHEN** "Garden" is in maintenance and has the actionable task "Water roses"
- **THEN** Next lists "Water roses" under its context as before
