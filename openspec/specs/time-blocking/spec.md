# time-blocking Specification

## Purpose
Defines duration estimates on tasks and the time-blocking calendar: how estimates are entered and shown, how tasks are placed on a Day or Week grid by drag or keyboard, how overlaps and daily capacity are displayed, how lists filter by duration, and how all of it behaves offline and across devices.

## Requirements

### Requirement: Duration estimate field
A task SHALL have an optional `estimate_minutes` value, a positive integer of at most 10080 (one week). It SHALL be an additive field written through the operation log, editable offline and converging by last-writer-wins. Rows SHALL show it compactly (`15m`, `1h 30m`), and clearing it SHALL be possible.

#### Scenario: Set an estimate offline
- **WHEN** the device is offline and the user sets an estimate of 45 minutes
- **THEN** the row shows `45m` at once and the change is uploaded on the next successful sync

#### Scenario: Invalid estimate
- **WHEN** a client submits zero, a negative or fractional number, a string, or more than 10080
- **THEN** the write is rejected as invalid and the estimate is unchanged

#### Scenario: Concurrent estimate and due edits
- **WHEN** device A sets the estimate while device B moves the task to another time slot, both offline, and both sync
- **THEN** every device shows A's estimate and B's time, because they are separate fields

### Requirement: Estimate entry
The detail panel SHALL offer an estimate control that accepts shorthand (`15m`, `1h`, `1h30`, `90`) and presets (15, 30, 45, 60, 90, 120 minutes), reachable from the keyboard, and a shortcut on a selected row SHALL open it.

#### Scenario: Shorthand parsing
- **WHEN** the user types `1h30` and presses Enter
- **THEN** the estimate becomes 90 minutes

#### Scenario: Keyboard entry from the list
- **WHEN** a task is selected in a list and the user presses `e`
- **THEN** the estimate control opens focused for that task, and typing `20` then Enter sets 20 minutes

### Requirement: Day and Week calendar views
The client SHALL provide Day and Week views as one Calendar destination, reachable by `g d` and `g w` and from the sidebar (the last mode remembered per device), using the page header (the range as title, with Today, previous, next and a Day/Week control as actions) and showing a 15-minute grid from a configurable start to end hour (default 06:00 to 22:00, scrollable beyond). The grid SHALL be the content column's own scroller. The views SHALL render from the local store and work offline.

#### Scenario: Open the week offline
- **WHEN** the device is offline and the user presses `g w`
- **THEN** the current week renders with every timed task as a block and date-only tasks in each day's lane

### Requirement: Tasks as calendar blocks
An open task with a due date and time SHALL appear as a block at that time, sized by its estimate, or by a 30-minute default rendered distinctly when unestimated. Tasks due that day without a time SHALL appear in an "unscheduled" lane above the grid. A task block SHALL be drawn as a soft fill of its project's palette hue (the Inbox hue for a task without a project) with a 3 px edge of the solid hue on its leading side and the strong text tone for its title, never as a white box with a coloured border; its edge SHALL meet 3:1 against the grid. A block on a day before today, and a block whose task is a completed occurrence shown by a view, SHALL be dimmed to the faint tone with its fill lightened, so the past reads as past at a glance. Today's grid SHALL carry one now line across its column at the current time, updated while the view is open, and no other day SHALL carry one. The selected block SHALL keep the accent ring as the one selection style.

#### Scenario: Unestimated block
- **WHEN** a task due today at 10:00 has no estimate
- **THEN** it appears as a 30-minute block with a dashed edge and no duration label, and its tooltip explains the dashed edge and offers Set estimate

#### Scenario: Completed tasks
- **WHEN** a task shown as a block is completed
- **THEN** it leaves the grid and the day's planned total decreases accordingly

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

### Requirement: Planning list and phone agenda
The list of tasks to plan SHALL open in the shell's panel slot with a design-system picker for its source, from Day, Week, Month and Plan. Its source SHALL be one of the Inbox, tasks without a date, earlier tasks, a project, a label or a saved list view, chosen with the Combobox (typing narrows the choices), and SHALL be remembered on the device; a source that no longer exists SHALL read as the Inbox. It SHALL list the source's open tasks only (never completed or deleted ones, nor tasks of archived projects), a label's by due date then priority and a view's in the view's own order. It SHALL stay open while the user moves to another day, week or month and switches between Day, Week, Month and Plan, and work with the range on screen. After `s` on a task in the list, Day and Week SHALL take the keys for the placement (arrows move it, Enter places it, Escape cancels it without closing the list) and SHALL then return focus to the list. Only its close button, Escape outside a placement, or opening a page outside the Calendar SHALL close it. Whether it is open SHALL be remembered on the device: closing it with its close button, Escape or the menu item remembers it closed, opening it remembers it open, and from 1024 px Day, Week, Month and Plan SHALL open it again on arrival while it is remembered open and the panel slot is empty; a task opened from the Calendar, or leaving the Calendar, SHALL not change what is remembered. Below 640 px the Week SHALL render as a vertical agenda grouped by day.

#### Scenario: Week on a phone
- **WHEN** the user opens the Week on a 390 px screen
- **THEN** the days are listed vertically with their tasks, and no seven-column grid is rendered

#### Scenario: Planning list in the panel slot
- **WHEN** the user opens the list of tasks to plan from the Calendar
- **THEN** it opens in the shell's panel slot with a picker for its source, and the grid stays in the content column

#### Scenario: The list stays open while the user moves through the Calendar
- **WHEN** the user opens Plan from a list in the Day, presses the next-day chevron, switches to Week and then to Month
- **THEN** the list is still open after each step, and pressing `s` on one of its tasks in the Month puts the task on the focused day

#### Scenario: Leaving the Calendar closes the list
- **WHEN** the planning list is open and the user opens Today
- **THEN** the panel slot is empty

#### Scenario: Place from the list with the keyboard
- **WHEN** the planning list is open in the Week, the user focuses a task in it, presses `s`, presses the down arrow twice and Enter
- **THEN** the task's due becomes that day 30 minutes after the first proposed time as one undoable change, the list stays open, and focus is on the next task in the list

#### Scenario: Escape cancels the placement first
- **WHEN** the user presses `s` on a task in the list and then Escape
- **THEN** the placement ends without a change, the list stays open, and focus is back on that task

#### Scenario: Plan from a label
- **WHEN** the user has labelled three open tasks "week", opens Plan from a list and picks the label "week" by typing "wee"
- **THEN** the list shows those three tasks, and after a reload the list opens on "week" again

#### Scenario: Plan from a saved view
- **WHEN** the user picks the saved view "Urgent" (`p1`) as the source
- **THEN** the list shows the open tasks the view shows, in the view's order, and no completed task even when the view shows completed tasks

#### Scenario: The source is gone
- **WHEN** the remembered source is a label that was deleted on another device
- **THEN** the list shows the Inbox

#### Scenario: The list is open again on return
- **WHEN** on a 1280 px screen the user opens Plan from a list in the Week, opens Today and then the Week again
- **THEN** the planning list is open, and after closing it with its close button, opening Today and the Week again, the panel slot is empty

#### Scenario: Not on a phone
- **WHEN** the planning list was left open and the user opens the Week on a 390 px screen
- **THEN** the list does not open by itself

### Requirement: Calendar follows the date and time preferences
The Week view SHALL start on the user's preferred first day of the week (OpenSpec `date-time-preferences`), and grid hours and block times SHALL follow the user's time format.

#### Scenario: Week starts on the preferred day
- **WHEN** the first day of the week is `sun`, today is Wednesday 2026-10-14 and the user presses `g w`
- **THEN** the week shown runs from Sunday 2026-10-11 to Saturday 2026-10-17

#### Scenario: Grid hours in 12-hour format
- **WHEN** the time format is `12h`
- **THEN** the grid's hour labels read `9 AM`, `10 AM` and so on, and moving a block still sets the same stored `HH:MM` due time

### Requirement: Place and resize blocks
Dragging a task from the unscheduled lane, from any list or from an existing block onto a grid slot SHALL set its due date and time to that slot, keeping its estimate; dragging a block's lower edge SHALL set its estimate in 15-minute steps; dragging a block's upper edge SHALL set its due time in 15-minute steps and its estimate to the time left until the block's unchanged end (at least 15 minutes; a block without an estimate counts as its drawn 30 minutes), as one change offered with Undo. The upper and lower edges SHALL take the same hit size, with the mouse and with a long press on touch, in Day and Week. Dropping on the unscheduled lane SHALL keep the date and clear the time. Each action SHALL be an ordinary field edit: applied locally first, queued offline, converging by last-writer-wins. A time fixed to a zone SHALL stay fixed to that zone. Events of subscribed calendars stay read-only.

#### Scenario: Drop on a slot
- **WHEN** the user drags a task onto Tuesday 14:30
- **THEN** the task's due becomes Tuesday at 14:30 immediately and the block appears there

#### Scenario: Resize
- **WHEN** the user drags the bottom edge of a 30-minute block down two rows
- **THEN** the estimate becomes 60 minutes

#### Scenario: Two devices move the same block
- **WHEN** device A moves a task to 09:00 and device B moves it to 11:00, both offline, and both sync
- **THEN** every device shows the task at the time written with the greater timestamp

#### Scenario: Start earlier from the upper edge
- **WHEN** the user drags the top edge of a 10:00 block with a 60-minute estimate up to 09:30
- **THEN** the task is due at 09:30 with a 90-minute estimate, the block still ends at 11:00, and one Undo puts back both

#### Scenario: Start later, never shorter than a slot
- **WHEN** the user drags the top edge of a 10:00 block without an estimate down past its end
- **THEN** the task is due at 10:15 with a 15-minute estimate

#### Scenario: Move keeps the length
- **WHEN** the user drags the middle of a 10:00 block with a 60-minute estimate to 13:00
- **THEN** the task is due at 13:00 and its estimate is still 60 minutes

### Requirement: Keyboard equivalent for every placement
With a block or lane task selected, arrow keys SHALL move it by 15 minutes or one day, `Shift` with up and down SHALL change the estimate by 15 minutes, `Alt`+`Shift` with up and down SHALL move the start by 15 minutes keeping the end, Enter SHALL open the detail panel, and a shortcut SHALL send a selected list task to the Day view's placement mode. No placement SHALL require a pointer.

#### Scenario: Move with arrows
- **WHEN** a block at 09:00 is selected and the user presses the down arrow twice
- **THEN** the task is due at 09:30

#### Scenario: Schedule from a list
- **WHEN** a task is selected in Today and the user presses `s`
- **THEN** the Day view opens with that task in placement mode, arrows pick a slot and Enter confirms

#### Scenario: Start earlier with the keyboard
- **WHEN** a 10:00 block with a 60-minute estimate is selected and the user presses `Alt`+`Shift`+up
- **THEN** the task is due at 09:45 with a 75-minute estimate

### Requirement: Overlap and capacity
Blocks that overlap in time SHALL be laid out side by side without hiding each other and SHALL carry an overlap marker. Each day column SHALL show the sum of estimates of its open timed and untimed tasks against a configurable day length (default 8 hours) and SHALL mark the day when the sum exceeds it. The capacity line SHALL be set in the muted text tone with tabular figures of the interface typeface, and SHALL turn to the danger tone with the over-capacity text when the day is over capacity; it SHALL never use a monospace face. Blocks of subscribed calendar events (OpenSpec `calendar-feeds`) SHALL take part in the side-by-side layout and the marker, and SHALL NOT count toward the sum.

#### Scenario: Two tasks at the same time
- **WHEN** two tasks are due today at 10:00
- **THEN** both blocks are visible side by side with the overlap marker

#### Scenario: Over capacity
- **WHEN** today's open tasks total 9 hours of estimates with an 8-hour day length
- **THEN** the day header shows `9h / 8h` in the danger tone, marked as over capacity

#### Scenario: Capacity line at rest
- **WHEN** today's open tasks total 2 hours of estimates with an 8-hour day length
- **THEN** the day header shows `2h / 8h` in the muted tone with tabular figures, so the figures of neighbouring days line up

#### Scenario: Task during a meeting
- **WHEN** a subscribed calendar has a meeting 10:00 to 11:00 and a 30-minute task is due today at 10:00
- **THEN** the task block and the event block are drawn side by side with the overlap marker, and the day header counts only the task's 30 minutes

#### Scenario: Calendars hidden
- **WHEN** the user hides calendars on this device
- **THEN** task blocks are laid out as if no events existed and the header is unchanged

### Requirement: Duration filter
Inbox, Today, Upcoming and project views SHALL offer a duration filter with "Quick wins" (15 minutes or less), "Under 30 min", "Over 1 h" and "Unestimated" from the Filter action in the page header. The options SHALL not be shown while no filter is active; an active filter SHALL be one chip in the header with a clear control. The filter SHALL apply to the local data, persist per device across reloads, and use one duration predicate that later filter features can reuse.

#### Scenario: Quick wins
- **WHEN** the user opens Filter in Today's page header and turns on "Quick wins"
- **THEN** only open tasks with an estimate of 15 minutes or less remain, and a "Quick wins" chip with a clear control is shown in the header

#### Scenario: No filter, no chips
- **WHEN** no duration filter is active in the Inbox
- **THEN** no filter options are rendered above the list

#### Scenario: Filter persists offline
- **WHEN** the device is offline, a filter is active and the page is reloaded
- **THEN** the same filter is still active

### Requirement: Grid preferences
Start hour, end hour and day length SHALL be per-device preferences editable in Settings, with defaults that need no setup, and SHALL not be synced.

#### Scenario: Change day length
- **WHEN** the user sets the day length to 6 hours in Settings
- **THEN** capacity markers on this device use 6 hours and other devices are unaffected
