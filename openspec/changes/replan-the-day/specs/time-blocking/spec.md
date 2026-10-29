## ADDED Requirements

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
The proposal SHALL be shown before anything is written. From 640 px, Day and Week SHALL draw each move as a ghost block at its new place and the original block in the faint tone, and the header's lead line SHALL become a bar with the count ("4 tasks move · 1 doesn't fit"), the choice for the tasks that do not fit (Leave them, the default, or Move to tomorrow), Apply and Cancel. Below 640 px the same SHALL be a bottom sheet listing each move as "<old time> → <new time> <title>". Enter in the bar SHALL apply and Escape SHALL cancel; dragging and placement keys SHALL be paused on the grid while the preview is open. When local data that feeds the proposal changes, or the next 15-minute mark passes, the proposal SHALL be recomputed; when nothing is missed any more the preview SHALL close with "Nothing to re-plan". A move to tomorrow that falls after the task's deadline SHALL carry the warning "After its deadline". Cancel SHALL write nothing.

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
