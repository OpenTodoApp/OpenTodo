## MODIFIED Requirements

### Requirement: Events are read-only and can be hidden
Event blocks, chips, rows and marks SHALL NOT be movable, resizable, completable or drop targets, and blocks, chips and rows SHALL be reachable with the keyboard for reading. The "Calendars" button of Day, Week, Plan, Month and Year, shown while the user has a calendar, SHALL open a menu whose first item, "Show calendar events", is a per-device switch that hides and shows every calendar's events in all of these views, kept across reloads and never synced. Below 768 px the switch is the page menu's "Calendars" item. The calendar rows that follow it are specified in "Calendars shown per workspace".

#### Scenario: Only the task moves
- **WHEN** the user drags on an event block
- **THEN** nothing is written and the block stays where it is, while a task block next to it can still be dragged

#### Scenario: Keyboard
- **WHEN** the user tabs onto an event block and presses Enter
- **THEN** a read-only popover shows the summary, time, location and calendar name, and Escape closes it; no key moves or edits the event

#### Scenario: Hide calendars on this device
- **WHEN** the user opens the toolbar's "Calendars" menu and unchecks "Show calendar events"
- **THEN** event blocks and chips disappear on this device only, the switch's state survives a reload, and other devices are unaffected

#### Scenario: Hidden in the Month and the Year
- **WHEN** the user turns "Show calendar events" off in the Month
- **THEN** the Month's event rows and the Year's event marks disappear on this device, and turning it on in either view shows them again in both

## ADDED Requirements

### Requirement: Calendars shown per workspace
The "Calendars" menu SHALL list, after the device switch, one checkable row per enabled calendar (subscriptions and calendar sync calendars), by name, with the calendar's colour dot and no other text, checked while the calendar is shown in the current workspace. Below 768 px the same rows SHALL follow the page menu's "Calendars" item. Choosing a row SHALL hide or show that calendar's events in the current workspace only, in Day, Week, Plan, Month, Year and in Today's and Upcoming's agenda, and the menu SHALL stay open. The choice SHALL be the synced preference `user_prefs.calendars_hidden`: a JSON object from workspace id to the ids of the calendars hidden there, written as one operation locally first, so it works offline, reaches the account's other devices with sync and converges by last-writer-wins. A calendar or workspace not in the object SHALL be shown, so a new calendar and a new workspace start with every calendar shown. A value that is not such an object SHALL read as nothing hidden and SHALL not be rewritten until the user changes a row; ids of deleted calendars or workspaces SHALL be ignored on read and dropped on the next write. Hidden calendars SHALL still count as busy for free time and for the assistant.

#### Scenario: Hide a calendar in one workspace
- **WHEN** the user, in the Personal workspace, opens "Calendars" in the Week and unchecks Work
- **THEN** Work's events disappear from the Week, the menu stays open with Work unchecked and Family checked, and one `user_prefs` operation is queued

#### Scenario: Switch workspace
- **WHEN** Work is hidden in Personal and the user switches to the Work workspace
- **THEN** Work's events show again, and switching back to Personal hides them

#### Scenario: A new calendar
- **WHEN** the user hid Work in Personal and then subscribes to a Holidays calendar
- **THEN** Holidays shows in every workspace, checked in the menu

#### Scenario: Device switch over the rows
- **WHEN** the user unchecks "Show calendar events" with Family checked
- **THEN** no calendar's events show on this device, and checking it again shows Family and leaves Work hidden in Personal

#### Scenario: Stale ids
- **WHEN** the stored value names a deleted calendar and a deleted workspace, and the user hides Family
- **THEN** the deleted calendar and workspace are ignored while drawing, and the written value names only Family in the current workspace

#### Scenario: From another device
- **WHEN** the user hides Work in Personal on their laptop, and the phone syncs
- **THEN** the phone no longer shows Work's events in Personal, also after going offline

#### Scenario: Free time unaffected
- **WHEN** Work is hidden in the current workspace and the assistant looks for free time
- **THEN** Work's busy events still block that time
