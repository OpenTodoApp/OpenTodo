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
| Review | the Daily check, the weekly review and the Monthly look, each with when it was last done and whether it is due, and whether the day is closed | the due rhythm, else the weekly review |

   Counts SHALL be shown as numerals with tabular figures, with the unit as secondary text. Catch, Clarify and Place at zero SHALL show a done mark in the success colour instead of the numeral; no move SHALL have a disabled control. Exactly one move SHALL be marked as the **next move** and SHALL carry the page's only primary action; the next move is the first of Clarify (Inbox not empty), Place (a project without a next action), Review (a rhythm due), Do (a next action exists), else Catch. Context chips on Do SHALL open Next. The Review move SHALL carry one more line, "Day: closed <time>" when the day was closed on the user's local date and "Close the day" otherwise, which opens Close the day; it is a plain link, never the primary action, and it SHALL NOT change which move is next.
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

#### Scenario: Close the day from the Review move
- **WHEN** the day is not closed, the Inbox is empty and the user activates "Close the day" on the Review move
- **THEN** the Close the day screen opens on its first step, and after closing it the Review move reads "Day: closed" with the time while the Inbox's done mark and the next move are unchanged

#### Scenario: Day closed on another device
- **WHEN** the Loop home is open on the laptop and the phone closes the day, which syncs
- **THEN** the Review move's line changes to "Day: closed" without a reload
