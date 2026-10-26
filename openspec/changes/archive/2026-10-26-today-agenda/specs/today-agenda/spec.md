## ADDED Requirements

### Requirement: Calendar events option on Today
Today's day-page menu SHALL offer "Show calendar events" and, while the option is on, "Hide calendar events" in its place, beside the briefing's item; on a phone the item SHALL be in the bar's overflow. The item SHALL be offered only while the device knows at least one subscribed calendar, the condition under which Day and Week offer their "Calendars" toggle; with calendar feeds off on the server, or no subscription, it SHALL not be offered. Upcoming SHALL not offer it. The option SHALL be off by default and SHALL be a synced preference of the account (`user_prefs.today_events`, "shown" or "hidden"), written as one operation locally first: it SHALL work offline, reach the account's other devices with sync and converge by last-writer-wins. An empty or unknown stored value SHALL read as off and SHALL not be rewritten.

#### Scenario: Turn it on
- **WHEN** the user has a subscribed calendar and chooses "Show calendar events" in Today's menu on the laptop
- **THEN** the menu offers "Hide calendar events" from then on, and the phone shows the agenda on Today after sync

#### Scenario: Offline choice
- **WHEN** the user turns the option on while offline
- **THEN** Today shows the cached events at once, and the choice reaches the other devices when the connection returns

#### Scenario: Feeds off
- **WHEN** the server owner has not enabled calendar feeds
- **THEN** Today's menu holds no calendar events item and Today shows no agenda

#### Scenario: Unknown value
- **WHEN** a newer client stores a value this version does not know in `today_events`
- **THEN** this version shows no agenda, offers "Show calendar events", and leaves the stored value unchanged

### Requirement: Today's agenda
With the option on, Today SHALL show a read-only agenda of the logical today's events from the user's enabled subscriptions, after the quick add and before the list's first group, scrolling with the list. It SHALL list the all-day and multi-day events covering today first, as chips, then the timed events in start order, one row each with the time range in the viewer's zone, the summary, the calendar's colour dot and the location when set; an event crossing midnight SHALL show the part inside today. A busy event SHALL use the calendar's event shape (sunken fill, hatched edge, calendar dot) and a free event the calendar's dashed outline. A timed event that ended at or before the current minute SHALL be dimmed by mixing, never by opacity, and the dimming SHALL follow the clock. Activating an event with a click, Enter or Space SHALL open the same read-only details popover as in Day and Week, and Escape SHALL close it; nothing in the agenda moves, edits or completes an event. On a day without events, no agenda and no empty block SHALL be shown. The per-device "Calendars" toggle of Day and Week SHALL not affect the agenda; events of disabled subscriptions SHALL never show. The agenda writes nothing.

#### Scenario: A morning with meetings
- **WHEN** today holds the all-day "Conference", a "Standup" from 09:00 to 09:15 and a free "Focus time" from 14:00 to 16:00 at "Room 2", and it is 10:00
- **THEN** the agenda shows the "Conference" chip, then "Standup" dimmed, then "Focus time" as a dashed outline with "Room 2", in that order, before Today's first task

#### Scenario: Details
- **WHEN** the user tabs to "Standup" in the agenda and presses Enter
- **THEN** the popover shows its summary, time and calendar name as in the Week view, and Escape closes it

#### Scenario: A quiet day
- **WHEN** the option is on and no subscribed calendar has an event today
- **THEN** Today shows its quick add followed directly by its list, with no agenda

#### Scenario: Hidden on the calendar grid
- **WHEN** the option is on and the user turned the Week's "Calendars" toggle off on this device
- **THEN** Today still shows today's events

#### Scenario: Disabled calendar
- **WHEN** the user disables the subscription "Family" in Settings
- **THEN** none of its events shows in Today's agenda

### Requirement: Agenda offline and freshness
The agenda SHALL be drawn from the device's cache of subscribed calendars, so it shows offline with the events as of the last refresh. While the option is on or the device knows a subscription, Today SHALL ask for a fresh copy of today's events when it opens and when the logical day changes, served from the cache while it is younger than 10 minutes; after a failed fetch Today SHALL not ask again from that device for 10 minutes. With the option off and no subscription known, Today SHALL make no request. After the user adds, changes or removes a subscription in Settings, a device without cached events SHALL fetch today's events, so it learns about its first calendar. When the cached copy is stale, or the device is offline, the agenda SHALL end with the calendar toolbar's line "Calendars as of <time>".

#### Scenario: Offline morning
- **WHEN** the device is offline and the events were cached at 07:40
- **THEN** Today shows the cached events of today and the agenda ends with "Calendars as of 07:40"

#### Scenario: Server without feeds
- **WHEN** the option is on and Today is opened twice within ten minutes on a server where calendar feeds are off
- **THEN** the device asks for events at most once and shows no agenda and no menu item

#### Scenario: First calendar
- **WHEN** a user who never opened the calendar on this device adds a calendar in Settings and opens Today
- **THEN** Today's menu offers "Show calendar events"

### Requirement: Agenda layout and accessibility
The agenda SHALL be a region named "Calendar events today". Each event SHALL be reachable with Tab and SHALL be a button whose accessible name begins with its visible text and adds the location, the calendar name, and whether it is free or ended; the details SHALL be announced as a dialog. At 375 px the rows SHALL fit the column without horizontal scrolling, the time SHALL not wrap and the summary and location SHALL end in an ellipsis when long; the same SHALL hold beside the docked side panel. The list's keyboard cursor (j, k and the arrow keys) SHALL not stop on events.

#### Scenario: Phone
- **WHEN** Today with three timed events opens on a 375 px screen
- **THEN** each event is one row with its time, summary and location, and the page does not scroll sideways

#### Scenario: Screen reader
- **WHEN** a screen reader reaches the free "Focus time" at "Room 2" of the calendar "Work"
- **THEN** it reads the time and "Focus time", then "Room 2", "Work" and that the event is free
