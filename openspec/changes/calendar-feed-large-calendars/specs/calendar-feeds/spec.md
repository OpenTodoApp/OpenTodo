## MODIFIED Requirements

### Requirement: Scheduled fetching
The server SHALL fetch every enabled subscription at least every 15 minutes while the feature is on, in one server process at a time, using conditional requests when the source supports them, with a 20-second timeout and a 32 MB download limit. It SHALL read a calendar as it arrives, one event at a time, and keep only the events that can add, move or remove an occurrence in the occurrence window: an event whose time or additional date overlaps it, a recurring event whose rule has no end or ends no earlier than the window, an override whose new time or replaced instance is in the window, and every override of this and following occurrences. One event SHALL hold at most 1 MB and 5,000 content lines (a larger one makes the calendar `invalid_calendar`), and the events kept from one calendar at most 4 MB; past that the rest SHALL be left out with a status warning. A fetch SHALL never make the previously stored events disappear unless it succeeds with new content.

#### Scenario: Unchanged source
- **WHEN** a source answers a conditional request with 304
- **THEN** the stored events are kept, no body is downloaded and the subscription's last-checked time advances

#### Scenario: Body too large
- **WHEN** a source sends more than 32 MB
- **THEN** the fetch is abandoned, the previous events are kept, the status reads `too_large` and the Calendar feeds screen says the calendar is larger than 32 MB and suggests calendar sync

#### Scenario: A calendar's whole history
- **WHEN** a source sends 10 MB: ten years of single events, a weekly event started years ago with one occurrence moved, and a few events in the window
- **THEN** the fetch succeeds, the stored occurrences are the windowed events and the weekly event's occurrences in the window with the moved one at its new time, no older event is stored, and the server's memory does not grow with the download

#### Scenario: Not a calendar
- **WHEN** a source answers 200 with an HTML page
- **THEN** the fetch fails with reason `invalid_calendar`, the previous events are kept and the status says the URL did not return a calendar

#### Scenario: Refresh now
- **WHEN** a user calls `POST /api/v1/calendar-feeds/subscriptions/{id}/refresh`
- **THEN** the fetch runs at once and the response carries the new status; from the thirteenth hand-triggered fetch of the user within an hour on, the response is 429 `rate_limited`
