## ADDED Requirements

### Requirement: Events in the Week agenda
Below 640 px, where the Week is a vertical agenda, each day SHALL list the events of the enabled subscriptions that are on it in the viewer's zone, by the rules of "Events drawn in Day and Week": all-day and multi-day occurrences after the day's spans, on each day they cover, saying "all day", and timed occurrences among the day's timed tasks at their start time, with the part inside the day for an event crossing midnight. Each event SHALL be a row of the agenda's touch height in the event shape (sunken fill, hatched leading edge, the calendar's dot; a dashed outline when free) showing its time, summary and length, read-only, reachable with Tab and opening the same details popover. A day holding only events SHALL not show the empty "Nothing planned." line. Events SHALL never take part in the agenda's selection or keyboard order. The agenda SHALL draw them from the device cache, offline included, as Day and Week do.

#### Scenario: Meeting between two tasks on a phone
- **WHEN** a phone shows the Week and the 18th holds a task at 08:30, a "Team sync" event from 10:00 to 11:00 and a task at 14:00
- **THEN** the 18th lists the 08:30 task, then "Team sync" with 10:00 and 1h, then the 14:00 task, and tapping "Team sync" opens its details and writes nothing

#### Scenario: All-day event on a phone
- **WHEN** a two-day all-day "Offsite" covers the 19th and 20th and those days hold no task
- **THEN** both days list "Offsite" as an all-day row and neither shows "Nothing planned."

#### Scenario: Disabled calendar on a phone
- **WHEN** an event belongs to a disabled subscription
- **THEN** no row is shown for it

### Requirement: Events in the Month
The Month SHALL show the events of the enabled subscriptions on the days they cover in the viewer's zone, by the rules of "Events drawn in Day and Week". In a cell they SHALL follow the day's tasks, projected occurrences and deadlines, all-day ones first, then timed ones in start order, each a compact read-only row in the event shape showing its start time when timed and its summary, and SHALL take part in the cell's "+N more" like its other rows. A cell's accessible name SHALL count its events apart from its tasks ("2 tasks, 2 events"). Events SHALL not be dragged, moved with the arrows, selected with `j` / `k`, or counted in the cell's task count; they count toward the cell's capacity only as "Count meetings in capacity" says. Below 640 px a cell holding events SHALL show a small hollow ring under its count, and the focused day's list under the grid SHALL list its events after its tasks as rows of the touch height. The Month SHALL fetch the events for the weeks it shows, and SHALL show the Calendars toggle and the calendars' freshness in its header as Day and Week do. Offline, the cached events SHALL be drawn and days outside the cache SHALL show none.

#### Scenario: Events after tasks inside "+N more"
- **WHEN** the 18th holds two tasks and the events "Team sync" at 10:00 and "Lunch" at 12:00, and a cell fits three rows
- **THEN** the cell shows the two tasks and "+2 more", and expanding it shows "10:00 Team sync" and "12:00 Lunch" after them

#### Scenario: Multi-day all-day event in the month
- **WHEN** a two-day all-day "Offsite" covers the 19th and 20th
- **THEN** the cells of the 19th and 20th show "Offsite" without a time and the 21st does not

#### Scenario: Month on a phone
- **WHEN** a phone shows the Month and the 18th holds an event and no task
- **THEN** the 18th's cell shows the ring and no count, and focusing it lists the event under the grid instead of "Nothing planned."

#### Scenario: Stacked months
- **WHEN** a device shows six months
- **THEN** the events of all six months are fetched and shown

### Requirement: Events marked in the Year
A day of the Year that holds events of the enabled subscriptions in the viewer's zone SHALL carry an event mark: a small hollow ring in the muted tone at the day's top start corner, told apart from the density mark and the over-capacity dot by its shape and place, never by colour alone. The mark SHALL not change the day's density, which counts tasks only. The day's accessible name SHALL add the number of events ("18 November, 1 event"), the day's tip SHALL show it after the tasks, and below 640 px a month's name SHALL say how many of its days hold events. The Year SHALL fetch the events of the year it shows, and SHALL show the Calendars toggle and the calendars' freshness in its header as Day and Week do. Offline, the cached events SHALL be marked and days outside the cache SHALL show no mark.

#### Scenario: A day with a meeting
- **WHEN** the 18th holds one event and no task
- **THEN** the 18th shows the event ring, no density mark, its name is "18 November, 1 event" and its tip says "1 event"

#### Scenario: Multi-day event in the year
- **WHEN** a two-day all-day event covers the 19th and 20th
- **THEN** both days show the ring and the 21st does not

## MODIFIED Requirements

### Requirement: Devices cache events for offline display
A device SHALL keep the occurrences and subscriptions it last fetched in local storage and render the calendar views from that cache, so Day, Week, Plan, Month and Year open offline with the events as of the last refresh. The device SHALL refresh the cache when a calendar view opens and the cache is older than 10 minutes or does not cover the view's days, when the server signals a change over the live channel, and when the connection returns; it SHALL fetch other date ranges on demand while online. A range of up to 92 days SHALL be fetched padded by up to 28 days on each side within 92 days; a wider range (several months, a year) SHALL be fetched as asked, at most 373 days, as consecutive requests of at most 92 days whose occurrences and subscriptions are merged by id and replace the cache together. A failed request SHALL keep the previous cache. The cache is per device and never synced.

#### Scenario: Open the week offline
- **WHEN** the device is offline and the user opens the Week view
- **THEN** the events fetched last time are drawn and the toolbar shows "Calendars as of <time>"

#### Scenario: Server refreshed a subscription
- **WHEN** a scheduled fetch changes a subscription's events while a device shows the Day view online
- **THEN** the device receives the change within a minute without reloading

#### Scenario: Beyond the cache offline
- **WHEN** the device is offline and the user navigates to a week outside the cached range
- **THEN** no events are drawn for it and the toolbar says calendars are unavailable offline for those days

#### Scenario: Sign-out clears the cache
- **WHEN** the user signs out on a device
- **THEN** its cached events and subscriptions are deleted with the rest of the local data

#### Scenario: A year in pieces
- **WHEN** the Year of 2026 opens with no cache
- **THEN** the device requests 1 January to 2 April, 3 April to 3 July, 4 July to 3 October and 4 October to 31 December, stores each event once, and the cache covers the year

### Requirement: Events are read-only and can be hidden
Event blocks, chips, rows and marks SHALL NOT be movable, resizable, completable or drop targets, and blocks, chips and rows SHALL be reachable with the keyboard for reading. A per-device toolbar toggle, shown in Day, Week, Plan, Month and Year while the user has a calendar, SHALL hide and show them in all of these views, kept across reloads and never synced.

#### Scenario: Only the task moves
- **WHEN** the user drags on an event block
- **THEN** nothing is written and the block stays where it is, while a task block next to it can still be dragged

#### Scenario: Keyboard
- **WHEN** the user tabs onto an event block and presses Enter
- **THEN** a read-only popover shows the summary, time, location and calendar name, and Escape closes it; no key moves or edits the event

#### Scenario: Hide calendars on this device
- **WHEN** the user turns the toolbar's "Calendars" toggle off
- **THEN** event blocks and chips disappear on this device only, the toggle state survives a reload, and other devices are unaffected

#### Scenario: Hidden in the Month and the Year
- **WHEN** the user turns "Calendars" off in the Month
- **THEN** the Month's event rows and the Year's event marks disappear on this device, and turning it on in either view shows them again in both
