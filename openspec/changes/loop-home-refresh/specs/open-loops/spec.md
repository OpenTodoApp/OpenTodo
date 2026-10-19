# Spec Delta

## MODIFIED Requirements

### Requirement: Loop home
The app SHALL offer a Loop home at `/loop`, reachable in every mode from the More group, the command palette and `g` then `Shift+L`, and as a start view. It SHALL show, in this order:

1. **Capture**: a quick-add field that creates tasks in the Inbox, the same quick add as the Inbox view, with the Catch move's count beside it on the rail. Capturing SHALL keep focus in the field for the next entry. The field is the only chrome above the rail besides the page header.
2. **The rail**: one element per move, in method order (Catch, Clarify, Place, Do, Review), each with live counts computed on the device and each being one link that opens the screen doing that move:

| Move | Counts | Opens |
| --- | --- | --- |
| Catch | open Inbox tasks | the Inbox |
| Clarify | open Inbox tasks | triage |
| Place | projects without a next action, stalled projects | the review's project walk |
| Do | next actions, waiting tasks, and the next actions per context as chips | Next |
| Review | the Daily check, the weekly review and the Monthly look, each with when it was last done and whether it is due | the due rhythm, else the weekly review |

   Counts SHALL be shown as numerals with tabular figures, with the unit as secondary text. A move whose count is zero and that has nothing due SHALL show a done mark in the success colour instead of the numeral and SHALL have no disabled control. Exactly one move SHALL be marked as the **next move** and SHALL carry the page's only primary action; the next move is the first of Clarify (Inbox not empty), Place (a project without a next action), Review (a rhythm due), Do (a next action exists), else Catch. Context chips on Do SHALL open Next.
3. **Today's focus** from the Daily check, with the usual row actions and an indicator of how many of the chosen tasks are done. When no focus is chosen the section SHALL offer to start the Daily check.
4. **The Loop pulse** (see the Loop pulse requirement).

When the Inbox is empty, every project has a next action and no rhythm is due, the page SHALL show a short closed-loop line above the rail and no "nothing to decide" wording. The page SHALL work offline and reflect remote changes live. The rail SHALL read in order as a list for assistive technology, each move with its name as a heading, and SHALL wrap into one column at 360 px without horizontal scrolling. The loading state SHALL have the same shape as the loaded page.

#### Scenario: Morning on the Loop home
- **WHEN** the Inbox holds 7 tasks, two projects have no next action, and the weekly review was finished 9 days ago
- **THEN** Catch and Clarify show 7, Place shows 2, Review shows the weekly review as due, Clarify is the next move and carries the one primary action, and activating it opens triage on the first Inbox task

#### Scenario: Capture from the Loop home
- **WHEN** the user types "Call the plumber" into the capture field and presses Enter
- **THEN** the task is in the Inbox, Catch and Clarify show one more, and focus stays in the field

#### Scenario: Next move moves on
- **WHEN** the Inbox is emptied in triage and the user returns to the Loop home while one project has no next action
- **THEN** Clarify shows a done mark, Place is the next move and carries the primary action "Walk your projects"

#### Scenario: Loop closed
- **WHEN** the Inbox is empty, every project has a next action and the Daily check and weekly review are not due
- **THEN** the page shows the closed-loop line, Catch, Clarify and Place show done marks, Do is the next move, and no control is disabled

#### Scenario: A capture from another device
- **WHEN** the Loop home is open and another device captures a task into the Inbox, which syncs
- **THEN** the Catch and Clarify counts rise by one without a reload

#### Scenario: Keyboard path
- **WHEN** the user presses `g` then `Shift+L`, then Tab past the capture field to the Do move and Enter
- **THEN** the Next view opens

#### Scenario: Phone width
- **WHEN** the Loop home is shown on a 360 px wide screen
- **THEN** the capture field, the five moves as one column, Today's focus and the Loop pulse are shown without horizontal scrolling

## ADDED Requirements

### Requirement: Loop pulse
Below Today's focus the Loop home SHALL show a Loop pulse: four figures about the last 14 local days, computed on the device from the local task rows at the time they are shown, with nothing written (no op, no synced cache) and nothing sent to the server. They SHALL be shown offline, and because every device holds the same rows after sync, every device SHALL show the same figures; there is nothing to converge. The figures are:

- **Done this week**: completed tasks in the current week, and the difference to last week, both as the statistics capability defines completed and the two periods.
- **Caught, decided**: of the live tasks created in the last 14 days, how many no longer qualify for the Inbox (they have a project, are a subtask, or are completed), as "n of m". Deleted tasks count in neither number.
- **Oldest in Inbox**: the age in whole local days of the oldest live open Inbox task, shown as "empty" when the Inbox is empty, and marked as a caution when older than seven days.
- **Completed per day**: completions per local day for the 14 days as one single-hue bar strip whose heights share one scale, with the current week's total printed and each day's value available on hover or focus, plus a text alternative that lists the fourteen values.

The pulse SHALL link to the Statistics screen. With end-to-end encryption the figures are the same, since none of them reads content.

#### Scenario: Agrees with Statistics
- **WHEN** the Loop home says 9 done this week and the user opens Statistics for this week
- **THEN** Statistics shows completed 9

#### Scenario: Caught and decided
- **WHEN** 19 tasks were created in the last 14 days, 11 of them now have a project or are completed, and one of the remaining 8 was deleted
- **THEN** the pulse shows "11 of 18"

#### Scenario: Inbox age
- **WHEN** the oldest open Inbox task was created 9 local days ago
- **THEN** the pulse shows 9 days with the caution mark, and shows "empty" once the Inbox is cleared

#### Scenario: Offline and nothing sent
- **WHEN** the Loop home is opened without a connection and used
- **THEN** the pulse is shown from local data and no request other than ordinary sync leaves the device
