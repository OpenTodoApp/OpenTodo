## ADDED Requirements

### Requirement: Phone header actions
Below 768 px a list SHALL show its actions in the shell's bar and its overflow menu, never as a row of controls between the bar and the quick add, so the rule "Nothing between the header and the list" holds at every width. The bar SHALL show at most two visible actions: Process the Inbox in the Inbox, the Ask action in Today when the assistant is available, and otherwise the duration filter where the view has one; Display mode, "Select tasks", the duration filter when the slots are taken, and the rest SHALL be in the overflow. The Inbox's count of planned tasks without a project SHALL be the bar's subtitle and SHALL open the Filter view as on the desktop. An active filter SHALL show as one chip with a clear control in the bar, not above the list.

#### Scenario: Today on a phone
- **WHEN** Today with ten tasks opens on a 390×844 phone
- **THEN** the only chrome above the first task is the bar and the quick add, Display mode is in the bar's overflow, and at least four tasks are visible without scrolling

#### Scenario: Inbox on a phone
- **WHEN** the Inbox with eight tasks and three planned tasks without a project opens on a phone
- **THEN** the bar shows "Process 8" as a visible action, "3 planned tasks without a project" as its subtitle, and no row of controls under it

#### Scenario: Filter chip in the bar
- **WHEN** the user picks "Quick wins" from the filter in the bar of a project on a phone
- **THEN** the list is filtered and one chip with a clear control appears in the bar, and the first task keeps its place under the quick add

### Requirement: Swipe actions on rows
On a touch screen a task row SHALL offer two swipe actions: swiped right it completes the task (reopens it in Completed); swiped left it opens a Schedule sheet with Today, Tomorrow, Next week, Pick a day and Someday. A swipe SHALL take the row only after the finger has moved 12 px horizontally with less than 8 px of vertical movement, so a vertical scroll never moves a row. While the finger moves the row SHALL translate up to 120 px and show the action's edge as a soft tint with its icon and word; the action SHALL be named at 64 px, fire at 96 px or on a release faster than 0.5 px per ms past 64 px, and be cancelled, with the row returning within the ui duration, when the finger releases or returns under 32 px. A completed swipe SHALL run the completion feedback and SHALL offer the same Undo as a tap on the checkbox. Every swipe action SHALL also be the first items of the row's menu ("Complete", "Schedule…"), so no action needs a gesture. Rows SHALL NOT swipe while any row is ticked, when the user cannot edit the task, in the Trash, on board cards and calendar blocks, while the inline editor is open, or with a fine pointer. A long press without movement SHALL still start the drag. The first time a touch device shows a list with a swipeable row the first row SHALL peek 40 px to the right and back once (not under reduced motion) and a toast SHALL say what swiping does; the cue SHALL run once per device. Each action is the same local operation as its menu item, so it works offline and converges like any other edit.

#### Scenario: Swipe right completes
- **WHEN** the user drags a Today row 100 px to the right and lifts the finger
- **THEN** the task is completed with the completion feedback, the Undo toast appears, and the counts update

#### Scenario: Short pull cancels
- **WHEN** the user drags a row 50 px to the right and lets go
- **THEN** the row returns to its place and nothing changes

#### Scenario: Flick commits
- **WHEN** the user flicks a row to the right, releasing at 70 px after a fast move
- **THEN** the task is completed as with a full pull

#### Scenario: Swipe left schedules
- **WHEN** the user drags a row 100 px to the left and lifts, then taps Tomorrow in the sheet
- **THEN** the task's do-on date is tomorrow, the row re-sorts or leaves the view, and Undo is offered

#### Scenario: Vertical scroll is never a swipe
- **WHEN** the user drags a finger 30 px down and 10 px sideways over a row
- **THEN** the list scrolls and the row does not move

#### Scenario: No swipe during a selection
- **WHEN** two rows are ticked and the user drags a third row to the right
- **THEN** the row does not move and the list scrolls or nothing happens, and the row's checkbox ticks it on tap

#### Scenario: The menu has the same actions
- **WHEN** a touch user opens a row's menu
- **THEN** its first items are Complete and Schedule…, which do what the two swipes do

#### Scenario: Viewer cannot swipe
- **WHEN** a member with the viewer role drags a row of a shared project to the right
- **THEN** the row does not move and the task stays open

#### Scenario: Offline swipe
- **WHEN** the device is offline and the user swipes a row right
- **THEN** the task is completed at once, the op is queued, and other devices converge on the completed state after sync

#### Scenario: The cue runs once
- **WHEN** a touch device shows its first list with tasks
- **THEN** the first row peeks right and back once and a toast explains the two swipes, and no later list on that device shows the cue

#### Scenario: Reduced motion cue
- **WHEN** reduced motion is requested on a device that has not seen the cue
- **THEN** the toast is shown and no row moves
