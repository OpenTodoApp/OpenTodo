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
Blocks that overlap in time SHALL be laid out side by side without hiding each other and SHALL carry an overlap marker. Each day column SHALL show the sum of estimates of its open timed and untimed tasks against a configurable day length (default 8 hours) and SHALL mark the day when the sum exceeds it. The capacity line SHALL be set in the muted text tone with tabular figures of the interface typeface, and SHALL turn to the danger tone with the over-capacity text when the day is over capacity; it SHALL never use a monospace face. Blocks of subscribed calendar events (OpenSpec `calendar-feeds`) SHALL take part in the side-by-side layout and the marker, and SHALL NOT count toward the sum unless the device's "Count meetings in capacity" option (see "Grid preferences") is on. With the option on, the sum SHALL add the day's event minutes as defined by OpenSpec `planner-view` "Event minutes in the capacity" (busy timed occurrences of enabled calendars shown on this device, overlaps counted once, all-day and free events left out), the tooltip SHALL name both parts ("4h 15m of tasks, 2h 30m in meetings"), and a day whose tasks alone fit but whose tasks plus event minutes exceed the day length SHALL be marked in the warning tone with the text "Over with meetings", while a day whose tasks alone exceed it keeps the danger tone. Both marks SHALL be in the line's accessible name, never shown by colour alone. Events hidden on the device are neither drawn nor counted. Nothing is written by the option or the sum; it is computed on the device from local data and works offline.

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

#### Scenario: Meetings counted
- **WHEN** "Count meetings in capacity" is on, today's open tasks total 4h 15m, busy meetings run 09:00 to 10:30 and 14:00 to 15:00, and the day length is 8 hours
- **THEN** the day header reads `6h 45m / 8h` in the muted tone and its tooltip reads "4h 15m of tasks, 2h 30m in meetings"

#### Scenario: Over only with meetings
- **WHEN** the option is on, today's tasks total 6 hours and busy meetings total 3 hours with an 8-hour day length
- **THEN** the header shows `9h / 8h` in the warning tone with "Over with meetings", and a screen reader announces "over with meetings"

#### Scenario: Over with tasks alone
- **WHEN** the option is on, today's tasks total 9 hours and meetings 1 hour with an 8-hour day length
- **THEN** the header shows `10h / 8h` in the danger tone marked as over capacity

#### Scenario: Free and all-day events do not count
- **WHEN** the option is on and today holds a free (transparent) 10:00 to 12:00 event and an all-day "Offsite" event
- **THEN** neither adds to the sum, and the header equals the tasks' estimates

#### Scenario: Option on, calendars hidden
- **WHEN** the option is on and the user turns the toolbar's "Calendars" toggle off
- **THEN** no event is drawn or counted and the header shows the tasks' sum only

#### Scenario: Offline outside the cache
- **WHEN** the option is on, the device is offline and the Week shows a day outside the device's event cache
- **THEN** that day counts no event minutes and its tooltip says calendars are unavailable offline for that day

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
Start hour, end hour, day length and "Count meetings in capacity" SHALL be per-device preferences editable in Settings › Calendar, with defaults that need no setup (the option off), and SHALL not be synced. The option SHALL be shown only while the device knows at least one subscribed or connected calendar; a stored value SHALL be kept while it is hidden. A missing or invalid stored value SHALL read as its default.

#### Scenario: Change day length
- **WHEN** the user sets the day length to 6 hours in Settings
- **THEN** capacity markers on this device use 6 hours and other devices are unaffected

#### Scenario: Turn meetings on for this device
- **WHEN** the user turns on "Count meetings in capacity" on the laptop
- **THEN** the laptop's Day, Week and Month count busy event minutes and the phone's do not

#### Scenario: No calendar, no option
- **WHEN** the device knows no subscribed or connected calendar
- **THEN** Settings › Calendar shows no "Count meetings in capacity" row and capacity counts tasks only

### Requirement: Short blocks never cover each other
Every block on the Day and Week grids, task or event, SHALL be drawn at least tall enough for one line of its title, and blocks whose drawn boxes would overlap SHALL be laid out side by side like blocks that overlap in time, so no block hides another. The overlap marker SHALL appear only on blocks whose times overlap.

#### Scenario: Short tasks close together
- **WHEN** a day has tasks at 13:30 for 15 minutes, 13:45 for 5 minutes, 13:50 for 10 minutes and 14:00 for 15 minutes
- **THEN** each block shows its title, the blocks sit in columns where they would otherwise cover each other, and none of them carries the overlap marker

#### Scenario: Long blocks keep the full width
- **WHEN** a day has a one-hour task at 10:00 and a 90-minute task at 11:00
- **THEN** both are drawn across the full column width, one under the other

### Requirement: Missed blocks and where to re-plan
A missed block SHALL be an open, not deleted task due on the logical today with a time, whose block end (its due time plus its estimate, or plus the 30-minute default) is at or before now. Tasks the user may not edit, tasks of a shared project assigned to another member, the task with the user's running time entry and tasks of archived projects SHALL never count as missed. While today is shown in Day or Week and at least one missed block exists, the header's lead line SHALL read "<n> blocks behind · Re-plan", and the calendar's overflow menu, Today's overflow menu and the command palette SHALL offer "Re-plan the rest of the day"; from Today it SHALL open the Day view of today with the preview open. Without a missed block none of these SHALL be shown or enabled. No shortcut SHALL be added.

#### Scenario: Behind at half past one
- **WHEN** it is 13:30 and today has open tasks at 09:00 (60 min), 10:30 (30 min) and 11:00 (unestimated), and one at 13:00 (60 min)
- **THEN** the Day header reads "3 blocks behind · Re-plan", and the 13:00 task is not counted because it is in progress

#### Scenario: Nothing behind
- **WHEN** every timed task of today ends after now or is completed
- **THEN** no Re-plan entry is shown in the header, the menus or the palette

#### Scenario: Viewer of a shared project
- **WHEN** a missed 09:00 task belongs to a shared project where the user is a viewer
- **THEN** it is not counted and never moved

#### Scenario: From Today
- **WHEN** the user opens Today's overflow menu at 14:00 with two missed blocks and chooses "Re-plan the rest of the day"
- **THEN** the Day view of today opens with the preview showing both moves

### Requirement: Re-plan packs missed blocks deterministically
Re-plan SHALL compute a proposal on the device: starting at now rounded up to the next 15 minutes and ending at the device's grid end hour on the logical today, it SHALL place the missed blocks, sorted by original due time, then priority, then task id, each into the first free interval on a 15-minute mark that holds its whole length (its estimate, or 30 minutes). Other open timed task blocks of today and busy timed events of enabled subscriptions shown on this device SHALL be busy; free events, all-day events and calendar frames SHALL NOT be. A block that finds no interval SHALL be listed as not fitting. The same tasks, events, preferences and clock SHALL give the same proposal on every device. Offline, the proposal SHALL use local tasks and the device's cached events, and for a day outside the cache SHALL pack around tasks only and say that calendars are unavailable offline.

#### Scenario: Around a meeting
- **WHEN** it is 13:20, missed blocks are A at 09:00 (60 min) and B at 10:00 (30 min), a busy event runs 13:30 to 14:30, and the grid ends at 22:00
- **THEN** A is proposed at 14:30 and B at 15:30, because 13:30 is the next mark and the meeting fills 13:30 to 14:30

#### Scenario: Order kept, small tasks not jumped ahead
- **WHEN** missed blocks are A at 09:00 (90 min, priority 4) and B at 10:00 (15 min, priority 1), and the free time is 15:00 to 15:30 and 16:00 to 22:00
- **THEN** A is proposed at 16:00 and B at 15:00, because A goes first and takes the first interval that holds it, and B then takes the earlier hole

#### Scenario: Does not fit
- **WHEN** it is 21:10, the grid ends at 22:00 and three 30-minute blocks are missed
- **THEN** the first is proposed at 21:15, and the other two are listed as not fitting

#### Scenario: After the grid end
- **WHEN** it is 23:00 and the grid ends at 22:00
- **THEN** every missed block is listed as not fitting and nothing is proposed to move today

#### Scenario: Calendars hidden
- **WHEN** the device's Calendars toggle is off and a busy event runs 15:00 to 16:00
- **THEN** the packer treats 15:00 to 16:00 as free, as the grid shows it

#### Scenario: Offline beyond the cache
- **WHEN** the device is offline and today lies outside its cached event window
- **THEN** the proposal packs around tasks only and the preview says calendars are unavailable offline

### Requirement: Re-plan is a preview first
The proposal SHALL be shown before anything is written. Where the page header has its own row (from 768 px), Day and Week SHALL draw each move as a ghost block at its new place and the original block in the faint tone, and the header's lead line SHALL become a bar with the count ("4 tasks move · 1 doesn't fit"), the choice for the tasks that do not fit (Leave them, the default, or Move to tomorrow), Apply and Cancel. Below 768 px, where the lead line moves into the shell's bar, the same SHALL be a bottom sheet listing each move as "<old time> → <new time> <title>". Enter in the bar SHALL apply and Escape SHALL cancel; dragging and placement keys SHALL be paused on the grid while the preview is open. When local data that feeds the proposal changes, or the next 15-minute mark passes, the proposal SHALL be recomputed; when nothing is missed any more the preview SHALL close with "Nothing to re-plan". A move to tomorrow that falls after the task's deadline SHALL carry the warning "After its deadline". Cancel SHALL write nothing.

#### Scenario: Cancel writes nothing
- **WHEN** the user opens the preview and presses Escape
- **THEN** no operation is written, the ghosts disappear and the blocks are where they were

#### Scenario: Another device completes a task meanwhile
- **WHEN** the preview shows three moves and another device's completion of one of them arrives by sync
- **THEN** the preview shows two moves without being reopened

#### Scenario: Phone
- **WHEN** the user taps Re-plan on a 390 px screen
- **THEN** a bottom sheet lists "09:00 → 14:30 Write report" style rows, the unfit choice, Apply and Cancel, each target at least 48 px, and the grid shows no ghosts

#### Scenario: Deadline warning
- **WHEN** a task that does not fit has its deadline today and the user chooses Move to tomorrow
- **THEN** its row shows "After its deadline" before Apply

### Requirement: Applying a re-plan is one batch with one Undo
Apply SHALL write every move, and with Move to tomorrow every unfit task's due date set to the next logical day with the same time, as one batch of ordinary `due` edits through the operation log: applied locally first, queued offline, converging per field by last-writer-wins, with no other field written. A time fixed to a zone SHALL stay fixed to that zone, the new wall time converted as a drag converts it. Right before writing, a task that is no longer open, no longer editable or whose due changed since the preview SHALL be skipped, and the confirmation SHALL say how many were skipped. The confirmation SHALL offer one Undo that restores every due value the batch changed. Nothing SHALL be moved without Apply.

#### Scenario: Apply and undo
- **WHEN** the user applies a preview of four moves and then presses Undo in the toast
- **THEN** all four tasks are back at their morning times as one step, on this device at once and on other devices after sync

#### Scenario: Offline apply
- **WHEN** the device is offline and the user applies three moves
- **THEN** the grid shows the new times at once, and the edits are uploaded on the next successful sync

#### Scenario: Concurrent move on another device
- **WHEN** after this device applies the re-plan, another device that was offline had moved one of the same tasks to 18:00 at a later time, and both sync
- **THEN** every device shows that task at 18:00 and the others at their re-planned times

#### Scenario: Changed meanwhile
- **WHEN** a task's due changed on another device between the preview and Apply
- **THEN** that task is skipped and the toast reads "3 moved · 1 changed meanwhile"

#### Scenario: Zone kept
- **WHEN** a missed task is due 09:00 fixed to `America/New_York`, viewed from Berlin, and is proposed at 16:00 Berlin time
- **THEN** after Apply it is due 10:00 `America/New_York` and still fixed to that zone

#### Scenario: Encrypted account
- **WHEN** the account is end-to-end encrypted and the user applies a re-plan
- **THEN** the same due operations are written as on any account, and no content is read or changed

### Requirement: Add with the pointer in Day and Week
A double-click on an empty part of the Day or Week grid (no block, event, deadline chip or frame title under the pointer) SHALL open the add dialog with that date and the slot's 15-minute start, and a double-click in a day's unscheduled lane SHALL open it with the date only. A right-click on the same places, or a long press of 500 ms on touch, SHALL open a menu at that place with Add task here… and the entries other calendar features add there. A fine pointer SHALL see a faint highlight of the 15-minute slot under it. `q` in Day and Week SHALL open the same dialog for the focused day without a time, so no addition needs a pointer. The task SHALL be created locally with no network round trip and synced like any new task.

#### Scenario: Double-click a slot
- **WHEN** the user double-clicks Tuesday 14:30 in the Week, types "Call the bank" and presses Enter
- **THEN** a task "Call the bank" due Tuesday at 14:30 appears as a block there at once

#### Scenario: Context menu
- **WHEN** the user right-clicks Wednesday 09:00
- **THEN** a menu opens at the pointer with Add task here…, and choosing it opens the dialog with Wednesday 09:00

#### Scenario: Long press on a phone
- **WHEN** on a touch screen the user long-presses an empty slot of the Day view
- **THEN** the same menu opens as a bottom sheet, while a long press on a task block keeps its existing behaviour

#### Scenario: Keyboard
- **WHEN** a Week is shown with a block on Thursday selected and the user presses `q`
- **THEN** the add dialog opens for Thursday without a time, and a typed "at 4pm" sets 16:00

#### Scenario: Offline
- **WHEN** the device is offline and the user double-clicks a slot and adds a task
- **THEN** the block appears at once and the task is uploaded on the next sync

### Requirement: Colour by
The Calendar's overflow menu SHALL offer Colour by with Project (default), Label and Priority, applying to Day, Week, Month and Plan, stored per device and never synced. With Label, a task SHALL take the hue of the first of its labels, in the user's label order, whose colour is not the default grey, else the neutral hue; with Priority, priorities 1 to 3 SHALL take the priority hues and priority 4 the neutral hue. The fill, edge, contrast, dimming and selection rules of task blocks SHALL apply unchanged to the chosen hue. Event blocks and frame bands SHALL keep their own look. A missing or unknown stored value SHALL read as Project.

#### Scenario: Colour by label
- **WHEN** the user chooses Colour by Label and a task carries "errand" (orange) and "call" (blue), with "call" first in the label order
- **THEN** its block is drawn in the blue hue, and a task without labels in the neutral hue

#### Scenario: Colour by priority
- **WHEN** the user chooses Colour by Priority
- **THEN** priority 1 blocks take the priority-1 hue and priority 4 blocks the neutral hue, each with a 3:1 edge against the grid in light and dark

#### Scenario: Per device
- **WHEN** the laptop colours by label
- **THEN** the phone's calendar still colours by project

### Requirement: Calendar layout of a project
A project's layout switch SHALL offer Calendar after Timeline, showing the Calendar in its last used mode (Day, Week, Month or Plan) narrowed to the project's open tasks and those of its sub-projects, inside the project page, with the planning list opening on the project as its source. The narrowing SHALL combine with an active calendar filter and SHALL not be shown as a chip. `v` SHALL cycle List, Board, Timeline and Calendar. The layout choice SHALL be stored per device like the other layouts, an older device reading it as List. The view SHALL render from local data and work offline.

#### Scenario: A project's week
- **WHEN** the user switches the project "Home" to Calendar while the last Calendar mode was Week
- **THEN** the project page shows this week with only the tasks of "Home" and its sub-projects as blocks, and events of subscribed calendars as usual

#### Scenario: Cycle with v
- **WHEN** a project shows its Timeline and the user presses `v`
- **THEN** the project shows its Calendar, and pressing `v` again shows its List

#### Scenario: Older device
- **WHEN** a device without this change opens a project stored with the Calendar layout
- **THEN** it shows the project's List
