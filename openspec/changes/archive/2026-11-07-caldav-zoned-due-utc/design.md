## Context

Apple's own zoned VTODO (`internal/caldav/testdata/apple-reminders.ics`, iOS 18) carries a VTIMEZONE before the VTODO with `TZID:Europe/Berlin`, a DAYLIGHT observance `RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU` and a STANDARD one `RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU`. Mozilla's zone table writes the same rules with 1970 DTSTARTs. The server wrote a one-year snapshot without RRULE; the VTIMEZONE already came before the VTODO.

## Decisions

### D1. A one-off zoned due is served in UTC
A due fixed to a zone is one instant (`absolute-datetimes`). UTC (`…Z`) needs no VTIMEZONE, so no client can misread the zone: the instant, and the alarms relative to DUE, are right everywhere. Clients show it in the device's zone, which is what a fixed instant means. The zone is not lost: it is the task's field, and D3 reads times sent back in it.

### D2. A repeating zoned due keeps its TZID, with a rule-based definition
In UTC a weekly 09:00 Berlin task would move to 08:00 in winter (RFC 5545 §3.8.5.3 computes occurrences in DTSTART's zone). So a series keeps `TZID`, and the VTIMEZONE is written as Apple writes it: rules derived from the zone database (each transition of the due's year as the n-th or last weekday of its month, checked against the following four years), DTSTART in 1970. A zone that follows no such rule (Asia/Jerusalem's Friday before the last Sunday, Africa/Cairo's last Thursday at 24:00, Africa/Casablanca) gets one-off observances from the due's year through the following four. The calendar feed (`calendar-feeds`) uses the same definition.

### D3. A UTC time sent back is read in the task's zone
`Inbound.KeepZone(current)`: when the task's due is a zoned time in a zone other than UTC and the client sent a UTC time, the same instant is the current due exactly (also a wall time in a spring-forward gap, served as the instant after the gap), and another instant is the wall time it falls on in the task's zone. It applies to DUE, the echoed DUE of the deadline shapes and RECURRENCE-ID overrides. A task created from a UTC time, or a floating one, keeps the existing reading (zone `UTC`).

## Data model

No change: the due value keeps `{date, time, tz}`; nothing new is stored or synced.
