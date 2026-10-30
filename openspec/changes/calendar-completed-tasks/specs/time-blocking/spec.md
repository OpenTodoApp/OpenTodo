## ADDED Requirements

### Requirement: Optional completed tasks in the Calendar
The Calendar SHALL have a keyboard-accessible Show completed toggle control in its existing header actions (a button on wide screens, a checked item in More actions on smaller screens), off by default, shared by Day, Week, Month and Plan. The choice SHALL be remembered only on this device across navigation and reloads and SHALL work offline. Enabling it SHALL include live completed tasks on their due date and time in the viewer's zone, with a struck-through title and an accessible completed status in blocks, lanes, overflow lists and phone agendas. Deleted tasks, undated tasks and tasks in archived projects SHALL stay excluded. Completed tasks SHALL NOT count towards remaining planned capacity, unestimated work or recurring projection sources. They SHALL remain selectable and openable, but calendar drag, resize, placement and completion shortcuts SHALL NOT change them. Changing visibility SHALL NOT create task operations; task completion and reopening SHALL continue through the ordinary op log, and devices with identical task rows and the same visibility choice SHALL show the same tasks after sync.

#### Scenario: Default calendar
- **WHEN** the user opens a calendar mode without a saved visibility choice
- **THEN** the Show completed button is not pressed and only open dated tasks appear

#### Scenario: Toggle once for all modes, offline
- **WHEN** the user enables Show completed offline, switches through Day, Week, Month and Plan, and reloads
- **THEN** the button stays pressed and each mode includes completed dated tasks without a network request or task operation

#### Scenario: Scheduled date rather than completion date
- **WHEN** a task due yesterday at 09:00 was completed today and Show completed is on
- **THEN** it appears yesterday at 09:00 with a struck-through title and a completed status

#### Scenario: Inspect completed work without rescheduling it
- **WHEN** the user selects a completed task with Show completed on and tries calendar arrows, resize, placement or the completion shortcut
- **THEN** its due date, estimate and completion stay unchanged and no task operation is queued, while Enter still opens its details

#### Scenario: Hide completed work again
- **WHEN** the user turns Show completed off
- **THEN** completed tasks disappear immediately from all calendar modes and their overflow counts without changing the task data or the remaining planned capacity

#### Scenario: Completion received from another device
- **WHEN** a completion or reopening operation arrives from another device
- **THEN** the task's visibility and title update from the converged local row according to this device's visibility choice

## MODIFIED Requirements

### Requirement: Tasks as calendar blocks
A visible task (open by default, also completed when Show completed is on) with a due date and time SHALL appear as a block at that time, sized by its estimate, or by a 30-minute default rendered distinctly when unestimated. Tasks due that day without a time SHALL appear in an "unscheduled" lane above the grid. A task block SHALL be drawn as a soft fill of its project's palette hue (the Inbox hue for a task without a project) with a 3 px edge of the solid hue on its leading side and the strong text tone for its title, never as a white box with a coloured border; its edge SHALL meet 3:1 against the grid. A block on a day before today, and a block whose task is a completed occurrence shown by a view, SHALL be dimmed to the faint tone with its fill lightened, so the past reads as past at a glance. Today's grid SHALL carry one now line across its column at the current time, updated while the view is open, and no other day SHALL carry one. The selected block SHALL keep the accent ring as the one selection style. Blocks and lanes SHALL render from local data while offline and SHALL reflect converged task rows after sync.

#### Scenario: Unestimated block
- **WHEN** a task due today at 10:00 has no estimate
- **THEN** it appears as a 30-minute block with a dashed edge and no duration label, and its tooltip explains the dashed edge and offers Set estimate

#### Scenario: Completed tasks
- **WHEN** a task shown as a block is completed while Show completed is off
- **THEN** it leaves the grid and the day's planned total decreases accordingly

#### Scenario: Completed task stays visible when opted in
- **WHEN** a task shown as a block is completed while Show completed is on
- **THEN** it stays at the same due date and time with a struck-through title and an accessible completed status, and the day's planned total decreases accordingly

#### Scenario: Capacity as a bar
- **WHEN** a day has 2 h 50 planned of 8 h with five unestimated tasks
- **THEN** the lane shows a capacity bar whose tooltip reads "2 h 50 of 8 h planned · 5 tasks without estimate"

#### Scenario: Filled block in the project hue
- **WHEN** a task of the blue project "Work" is due today at 14:00 with a 1 h estimate
- **THEN** its block has the blue soft fill, a 3 px solid blue edge on the left and the title in the strong text tone, in light and in dark

#### Scenario: Yesterday is dimmed
- **WHEN** the Week shows yesterday with two open timed tasks
- **THEN** both blocks are drawn in the faint tone with a lightened fill, today's blocks are not, and both remain draggable and keyboard-movable as before

#### Scenario: Now line on today only
- **WHEN** the Week is open at 10:17
- **THEN** today's column shows a line at 10:17 that moves as time passes, and the other six columns show none
