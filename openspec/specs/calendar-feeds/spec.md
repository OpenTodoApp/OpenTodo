# calendar-feeds Specification

## Purpose
Lets a user see their other calendars inside OpenTodo's Day and Week grids by subscribing to iCalendar URLs the server fetches on a schedule, and lets calendar apps subscribe to the user's tasks through a private read-only iCalendar feed URL, under one owner switch and the outbound policy shared with webhooks.

## Requirements

### Requirement: Off by default, enabled by the owner
Calendar feeds SHALL be disabled until the owner enables them in Settings or through the optional `OPENTODO_CALENDAR_FEEDS=true` preset, which applies on first start only. While disabled, every `/api/v1/calendar-feeds` route and every `/feeds/` path SHALL answer 404, and the server SHALL fetch no subscription. Enabling or disabling SHALL take effect without a restart and SHALL be recorded as a server setting. Every signed-in user SHALL read the state; only the owner SHALL change it.

#### Scenario: Default
- **WHEN** a server starts without `OPENTODO_CALENDAR_FEEDS` and the owner has never touched the setting
- **THEN** `GET /api/v1/settings/calendar-feeds` reports `enabled: false`, `/feeds/anything/tasks.ics` answers 404 and no outbound request is made

#### Scenario: Owner enables it
- **WHEN** the owner sends `PUT /api/v1/settings/calendar-feeds` with `{"enabled": true}`
- **THEN** the routes work on the next request, existing subscriptions are fetched within a minute, and the audit log holds a `settings.changed` event for `calendar_feeds.enabled`

#### Scenario: Member cannot change it
- **WHEN** a member calls `PUT /api/v1/settings/calendar-feeds`
- **THEN** the response is a 403 `forbidden` error and the setting is unchanged

#### Scenario: Preset applies once
- **WHEN** the server first starts with `OPENTODO_CALENDAR_FEEDS=true`, the owner later disables the feature, and the server restarts with the variable still set
- **THEN** the feature stays disabled

### Requirement: Subscription management
A signed-in user SHALL create, list, update, enable or disable and delete their own calendar subscriptions through Settings and `GET`/`POST /api/v1/calendar-feeds/subscriptions`, `PATCH`/`DELETE /api/v1/calendar-feeds/subscriptions/{id}`. A user SHALL have at most 10 subscriptions, and SHALL never see or touch another account's. Subscriptions are server data: never operations, never synced, never exported, so managing them needs a connection.

#### Scenario: Create a subscription
- **WHEN** a user POSTs `{"url": "webcal://calendar.example.com/team.ics", "name": "Team"}`
- **THEN** the response is 201 with the subscription, its first fetch has been attempted and its result is reported in the subscription's status

#### Scenario: Routes require authentication
- **WHEN** any `/api/v1/calendar-feeds` route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Eleventh subscription
- **WHEN** a user with 10 subscriptions posts another
- **THEN** the response is a 409 `limit_reached` error and nothing is stored

#### Scenario: Another user's subscription
- **WHEN** a user requests a subscription id that belongs to a different account
- **THEN** the response is a 404 `not_found` error

#### Scenario: Delete removes its events
- **WHEN** a user deletes a subscription
- **THEN** the response is 204 and its cached events are gone from the server and from every device after their next refresh

#### Scenario: Read token
- **WHEN** a `read` or `agent` API token creates, changes or deletes a subscription
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes

### Requirement: Subscription fields
A subscription SHALL have a URL with scheme `http`, `https` or `webcal` (read as `https`), at most 2,048 characters; a name of at most 100 characters, defaulting to the calendar's own name when it has one; a colour from the app's palette; and an enabled flag, on by default. A disabled subscription SHALL not be fetched and its events SHALL not be served.

#### Scenario: Invalid URL
- **WHEN** a user submits a `ftp://` URL or an empty one
- **THEN** the response is a 400 `invalid_input` error naming `url` and nothing is stored

#### Scenario: Name from the calendar
- **WHEN** a user adds a URL without a name and the calendar declares the name "Family"
- **THEN** the subscription is named "Family" after its first fetch

#### Scenario: Disable
- **WHEN** a user disables a subscription
- **THEN** its events disappear from the grid after the next refresh and no fetch of it happens until it is enabled again

### Requirement: Outbound fetch policy
Subscription fetches SHALL follow the private network protection of webhooks: addresses that are loopback, link-local, unique-local or private, multicast, unspecified or a cloud metadata address SHALL be refused at creation, at every URL change and at every fetch after resolving the host, unless the owner allowed private network targets; the connection SHALL go to the checked address, ignoring any proxy from the environment. Up to three redirects SHALL be followed, each hop checked the same way.

#### Scenario: Private target refused
- **WHEN** a user adds `http://192.168.1.20/calendar.ics` and the owner has not allowed private targets
- **THEN** the response is a 400 `private_target` error explaining the owner setting and nothing is stored

#### Scenario: Owner allows the local network
- **WHEN** the owner has allowed private network targets and the same URL is added
- **THEN** it is accepted and fetched

#### Scenario: Redirect to a private address
- **WHEN** a public host answers a subscription fetch with a redirect to `http://169.254.169.254/`
- **THEN** the redirect is not followed, the fetch fails with reason `private_target` and no connection to that address is made

#### Scenario: Too many redirects
- **WHEN** a host redirects four times in a row
- **THEN** the fetch fails with reason `too_many_redirects` and the subscription's status shows it

### Requirement: Scheduled fetching
The server SHALL fetch every enabled subscription at least every 15 minutes while the feature is on, in one server process at a time, using conditional requests when the source supports them, with a 20-second timeout and a 2 MB body limit. A fetch SHALL never make the previously stored events disappear unless it succeeds with new content.

#### Scenario: Unchanged source
- **WHEN** a source answers a conditional request with 304
- **THEN** the stored events are kept, no body is downloaded and the subscription's last-checked time advances

#### Scenario: Body too large
- **WHEN** a source sends more than 2 MB
- **THEN** the fetch is abandoned, the previous events are kept and the status reads `too_large`

#### Scenario: Not a calendar
- **WHEN** a source answers 200 with an HTML page
- **THEN** the fetch fails with reason `invalid_calendar`, the previous events are kept and the status says the URL did not return a calendar

#### Scenario: Refresh now
- **WHEN** a user calls `POST /api/v1/calendar-feeds/subscriptions/{id}/refresh`
- **THEN** the fetch runs at once and the response carries the new status; from the thirteenth hand-triggered fetch of the user within an hour on, the response is 429 `rate_limited`

### Requirement: Fetch backoff
After a failed fetch the subscription's interval SHALL double, up to 6 hours, and return to normal after a success. A calendar that declares a longer refresh interval SHALL be honoured up to 24 hours. A fetch refused by the outbound policy SHALL stop the schedule until the user edits or re-enables the subscription.

#### Scenario: Source down
- **WHEN** a source times out on three fetches in a row
- **THEN** the stored events from the last successful fetch stay visible, the status shows the error and the time of the last success, and the next attempt waits longer each time

#### Scenario: Calendar asks for hourly refresh
- **WHEN** a calendar declares a refresh interval of one hour
- **THEN** it is fetched about hourly instead of every 15 minutes

#### Scenario: Host turns private
- **WHEN** a subscription's host starts resolving to a private address and private targets are not allowed
- **THEN** the fetch fails with `private_target`, the subscription is marked as stopped, and no further fetch happens until the user edits or re-enables it

### Requirement: Occurrence window and expansion
From each fetched calendar the server SHALL keep the `VEVENT` occurrences that overlap the window from 30 days before to 365 days after the fetch day, expanding recurrence rules, additional dates, exceptions and overridden instances, and SHALL keep at most 5,000 occurrences per subscription, earliest first. A rule beyond the supported grammar SHALL yield its first occurrence only and be counted in the subscription's warnings.

#### Scenario: Weekly meeting with an exception
- **WHEN** a feed holds a Monday 10:00 to 11:00 event repeating weekly with one `EXDATE` and one moved occurrence (`RECURRENCE-ID`)
- **THEN** the stored occurrences skip the excluded Monday, show the moved one at its new time and keep every other Monday in the window

#### Scenario: Supported rule parts
- **WHEN** a rule uses `FREQ` daily, weekly, monthly or yearly with `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` with ordinals, `BYMONTHDAY`, `BYMONTH`, `BYSETPOS` or `WKST`
- **THEN** every occurrence in the window is produced

#### Scenario: Unsupported rule
- **WHEN** an event's rule uses `BYHOUR`
- **THEN** only its first occurrence is kept and the subscription's status counts one unsupported rule

#### Scenario: Occurrence cap
- **WHEN** a calendar expands to more than 5,000 occurrences in the window
- **THEN** the earliest 5,000 are kept and the status says the calendar was truncated

### Requirement: Occurrence content
Each stored occurrence SHALL carry the summary, location, start and end, whether it is all-day, whether it is busy or free, and its subscription. Times SHALL keep the zone they were given, with Windows zone names resolved to IANA zones; a zone that cannot be resolved SHALL make the times floating and be counted in the warnings. Cancelled events SHALL be dropped.

#### Scenario: Time zones
- **WHEN** an event starts at `09:00` with `TZID=W. Europe Standard Time` and another at `08:00Z`
- **THEN** both are stored with the zone they were given, the Windows name resolved to `Europe/Berlin`, and a device in Berlin shows the first at 09:00 and the second at 10:00 during summer time

#### Scenario: Unknown zone
- **WHEN** an event's `TZID` is neither an IANA nor a known Windows name
- **THEN** its times are stored as floating wall-clock times and the subscription's status counts one zone warning

#### Scenario: Cancelled event
- **WHEN** an event carries `STATUS:CANCELLED`
- **THEN** it is not stored and disappears from devices after their next refresh

### Requirement: Events served to devices
`GET /api/v1/calendar-feeds/events?from=YYYY-MM-DD&to=YYYY-MM-DD` SHALL return the caller's occurrences that overlap the range, at most 92 days wide, with start and end as `{date, time?, tz?}` values like a due, the subscription id and when the subscription was last refreshed. The route SHALL answer 400 `invalid_input` for a malformed or wider range.

#### Scenario: Week of events
- **WHEN** a device requests `from=2026-10-12&to=2026-10-18`
- **THEN** the response lists every occurrence of the user's enabled subscriptions that overlaps those days, including all-day and multi-day ones, and nothing from disabled subscriptions or other users

#### Scenario: Range too wide
- **WHEN** a device requests a range of 100 days
- **THEN** the response is a 400 `invalid_input` error naming `to`

#### Scenario: Unauthenticated
- **WHEN** the events route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Devices cache events for offline display
A device SHALL keep the occurrences and subscriptions it last fetched in local storage and render the grid from that cache, so Day and Week open offline with the events as of the last refresh. The device SHALL refresh the cache when a calendar view opens and the cache is older than 10 minutes, when the server signals a change over the live channel, and when the connection returns; it SHALL fetch other date ranges on demand while online. The cache is per device and never synced.

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

### Requirement: Events drawn in Day and Week
The Day and Week views SHALL draw each timed occurrence as a block between its start and end in the viewer's zone, and each all-day or multi-day occurrence as a chip in an all-day strip above the day's unscheduled lane, on each day it covers. An event block SHALL be told apart from a task block by its shape and texture, never by colour alone: it SHALL use the sunken surface as its fill, a hatched 3 px edge on its leading side, the muted text tone for its summary, and its calendar's colour only as a small dot before the summary, while task blocks use a solid edge and a hue fill. A block SHALL show the summary and, on hover or focus, the time, location and calendar name. A free (transparent) occurrence SHALL be drawn as a dashed outline only. The all-day strip SHALL show at most three chips per day; a day with more SHALL show the first three and a "+N" control that expands that day's strip on this device, remembered per device and never synced.

#### Scenario: Meeting next to a task
- **WHEN** a "Team sync" event runs 10:00 to 11:00 and a task block sits at 10:30
- **THEN** both are drawn side by side with the overlap marker, the event on the sunken fill with a hatched edge and its calendar's dot, the task with its project's hue fill and solid edge

#### Scenario: Told apart without colour
- **WHEN** a task of a green project and an event of a green calendar sit side by side
- **THEN** a viewer who cannot see the colour still tells them apart by the hatched edge and the dot of the event against the solid edge and fill of the task

#### Scenario: All-day event
- **WHEN** a subscription holds a two-day all-day "Offsite" event
- **THEN** an "Offsite" chip appears in the all-day strip of both days and nothing is added to the grid or the planned total

#### Scenario: Crowded all-day strip
- **WHEN** a day holds five all-day events
- **THEN** its strip shows three chips and "+2", activating it shows all five on this device until collapsed, and the other days' strips are unchanged

#### Scenario: Free events
- **WHEN** an occurrence is marked transparent (free) in its source
- **THEN** its block is drawn as a dashed outline only, so a free slot still reads as free

#### Scenario: Event across midnight
- **WHEN** an event runs from 22:00 to 02:00 the next day
- **THEN** it is drawn from 22:00 to the end of the first day and from 00:00 to 02:00 on the next

### Requirement: Events are read-only and can be hidden
Event blocks and chips SHALL NOT be movable, resizable, completable or drop targets, and SHALL be reachable with the keyboard for reading. A per-device toolbar toggle SHALL hide and show them, kept across reloads and never synced.

#### Scenario: Only the task moves
- **WHEN** the user drags on an event block
- **THEN** nothing is written and the block stays where it is, while a task block next to it can still be dragged

#### Scenario: Keyboard
- **WHEN** the user tabs onto an event block and presses Enter
- **THEN** a read-only popover shows the summary, time, location and calendar name, and Escape closes it; no key moves or edits the event

#### Scenario: Hide calendars on this device
- **WHEN** the user turns the toolbar's "Calendars" toggle off
- **THEN** event blocks and chips disappear on this device only, the toggle state survives a reload, and other devices are unaffected

### Requirement: Personal task feed URL
A signed-in user SHALL be able to create one private feed URL through Settings and `POST /api/v1/calendar-feeds/feed`, read its status (created, last used) through `GET`, rotate it with another `POST` and revoke it with `DELETE`. Creating or rotating SHALL require a recent sign-in like creating an API token and SHALL be refused for `read` and `agent` tokens.

#### Scenario: Create the feed
- **WHEN** a user creates the feed in Settings
- **THEN** the URL `https://<server>/feeds/<secret>/tasks.ics` is shown once with a copy action and setup notes for Google Calendar, Outlook and Apple Calendar, and later reads return only the creation and last-use times

#### Scenario: Rotate
- **WHEN** a user rotates the feed
- **THEN** a new URL is shown once, the old one answers 404 from then on, and the audit log holds `calendar_feed.rotated`

#### Scenario: Revoke
- **WHEN** a user revokes the feed
- **THEN** the response is 204, the URL answers 404, and `GET` reports no feed

#### Scenario: Stale session
- **WHEN** a session that has not proved its identity within the fresh window creates or rotates the feed
- **THEN** the response is a 403 `reauth_required` error and nothing changes

#### Scenario: Unauthenticated management
- **WHEN** `/api/v1/calendar-feeds/feed` is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Feed secret
The feed secret SHALL carry at least 32 random bytes with a recognisable prefix, SHALL be shown once and stored only as a hash, and SHALL be neither a session, an API token nor an app password: it SHALL be accepted only on the feed route, and no other credential SHALL be accepted there.

#### Scenario: Feed secret refused on the API
- **WHEN** the feed secret is presented as a bearer token to `/api/v1/tasks` or as an app password to `/dav/`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Session cookie refused
- **WHEN** a browser with a valid session requests `/feeds/<secret>/tasks.ics` with a wrong secret
- **THEN** the response is 404 regardless of the session

#### Scenario: Database holds no secret
- **WHEN** the server database is inspected
- **THEN** it holds a hash of the feed secret and not the secret itself

### Requirement: Feed content
`GET /feeds/{secret}/tasks.ics` SHALL answer `text/calendar` with one `VEVENT` per open, non-trashed task the user can see (own and shared projects, not archived) whose due date lies from 30 days before to 365 days after the request day. Completed, trashed and undated tasks SHALL NOT appear. The feed SHALL carry a calendar name and an `ETag` for conditional requests.

#### Scenario: Completed or undated tasks
- **WHEN** a task is completed, trashed, in an archived project or has no due date
- **THEN** it does not appear in the feed

#### Scenario: Shared project task
- **WHEN** a task in a project shared with the user is due next week
- **THEN** it appears in the user's feed

#### Scenario: Conditional request
- **WHEN** a calendar app repeats the request with the `ETag` it received and nothing changed
- **THEN** the response is 304 with no body

### Requirement: Feed event mapping
Each feed event SHALL map a date-only due to an all-day event, a timed due to an event starting at that time (floating, or with its zone and a matching time zone definition), lasting the task's estimate or 30 minutes; the title as summary, the description as description, the recurrence as `RRULE`, and a `UID` that stays the same for the task across requests.

#### Scenario: Timed task with an estimate
- **WHEN** a task "Dentist" is due 2026-10-14 at 15:00 with a 45-minute estimate
- **THEN** the feed holds a `VEVENT` from `20261014T150000` to `20261014T154500` with `SUMMARY:Dentist`

#### Scenario: Zoned and recurring
- **WHEN** a task is due 09:30 fixed to `Europe/Berlin` and repeats every Monday
- **THEN** its event carries `DTSTART;TZID=Europe/Berlin`, a matching `VTIMEZONE` and `RRULE:FREQ=WEEKLY;BYDAY=MO`

#### Scenario: Date-only task
- **WHEN** a task is due 2026-10-20 without a time
- **THEN** the feed holds an all-day event on 2026-10-20

### Requirement: Feed access control and limits
An unknown, revoked or deactivated secret SHALL answer 404 without revealing whether it ever existed, and such attempts SHALL be rate limited per client address like failed CalDAV sign-ins. A valid feed SHALL be served at most 60 times an hour and SHALL update its last-use time.

#### Scenario: Unknown secret
- **WHEN** a request names a secret that does not exist
- **THEN** the response is 404, and after 10 such requests from one address within a minute the next answers 429

#### Scenario: Deactivated account
- **WHEN** the owner deactivates an account that has a feed
- **THEN** the feed answers 404 from the next request on, and reactivation restores it

#### Scenario: Polled too often
- **WHEN** a calendar app fetches a feed for the 61st time within an hour
- **THEN** the response is 429 with a `Retry-After` header and the feed is unchanged

### Requirement: Calendar feeds screen
Settings → Integrations SHALL show a Calendar feeds panel with the owner switch (its state for members), the user's subscriptions with their status and actions, and the task feed's state with its actions, every action reachable with the keyboard and destructive ones confirmed in a dialog. Because the data lives on the server, the screen SHALL show the last fetched state while offline and disable actions until the connection returns.

#### Scenario: Subscription row
- **WHEN** a user opens the panel with a subscription whose last three fetches failed
- **THEN** its row shows name, colour, the error, the time of the last successful refresh and the actions edit, refresh, disable and delete

#### Scenario: Feature off for members
- **WHEN** the owner has not enabled calendar feeds and a member opens the panel
- **THEN** it says the owner has not enabled calendar feeds and offers no actions

#### Scenario: Offline
- **WHEN** the panel is opened without a connection
- **THEN** the previously loaded list is visible, actions are disabled and the screen says a connection is required

#### Scenario: Delete confirmed
- **WHEN** a user chooses Delete on a subscription
- **THEN** a dialog says its events will disappear from every device and asks to confirm before anything is deleted

### Requirement: Bounded recurrence expansion
A rule without `COUNT` SHALL be expanded from the window's start, producing the same occurrences in the window as a walk from `DTSTART`. One calendar's expansion SHALL share a budget of 500,000 rule periods and occurrence starts and a 5 second deadline; when either runs out, the occurrences found so far SHALL be kept with a status warning. Devices read the stored occurrences; an offline device keeps its cached events until it syncs.

#### Scenario: Old daily series
- **WHEN** a feed holds a daily event starting on 1 January 1970
- **THEN** every day of the window has its occurrence and the fetch finishes quickly

#### Scenario: Calendar that repeats too much
- **WHEN** a feed's rules would expand to more work than the budget allows
- **THEN** the fetch succeeds with the occurrences found so far and the status warns that some events are left out
