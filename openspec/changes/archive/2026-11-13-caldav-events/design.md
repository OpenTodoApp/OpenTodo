# Design

## D1. A property of the app password

a marker table `app_password_events(app_password_id)` (no row: to-dos), chosen at creation and shown in the list. One password, one mode: a client account is either a reminders account or a calendar account, which is how Apple Calendar, DAVx⁵ and Thunderbird set up CalDAV accounts. To change it, create another password.

## D2. Serving

In event mode the collections answer `supported-calendar-component-set` with `VEVENT`, and every report and GET serves `calfeed.WriteEvent` (the object Calendar sync writes, without `X-OPENTODO-TASK`'s connection marker) under the task's resource name. Only open tasks with a due date are members; ETags and the sync token follow the event's own content (title, notes, times, link), so a change of anything else does not make clients refetch. The CTag and `sync-collection` are per mode, so one account in each mode never sees the other's tokens.

## D3. Writes back

A PUT of a VEVENT onto an existing resource in event mode maps it as "Events become tasks" does and keeps only the title, notes and timing (due, start, span, estimate): those change the task, through `ApplyStrict` with device `caldav:<app-password-id>`. Nothing else of the event is written: labels, priority, reminders and the repeat rule are not in a served event, so an edit must not clear them. A DELETE clears the due date (and the span) and keeps the task. A PUT of a new VEVENT creates a task as "Events become tasks" already does. `If-Match` is required as today.

## D4. What it costs

No new dependency; the mapping is calsync's. A list of a calendar is bounded as today (`caldav-sync` "CalDAV lookups do not scan the account").
