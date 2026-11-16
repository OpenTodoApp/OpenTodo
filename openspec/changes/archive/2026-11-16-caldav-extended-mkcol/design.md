## Context

`MKCALENDAR` (RFC 4791) and extended `MKCOL` (RFC 5689) carry the same `DAV:set`/`DAV:prop` body. The only differences are the root element (`C:mkcalendar` against `D:mkcol`) and that `MKCOL` names the new collection's type in `DAV:resourcetype`.

## Decisions

### D1: One handler for both methods

`MKCOL` reuses the `MKCALENDAR` handler after one extra check: the body's `resourcetype` must contain `C:calendar`. That way both methods share every rule (name, colour, component set, workspace, scope, purged names), and none can drift between them.

### D2: Anything but a calendar is refused with 403

A plain `MKCOL` (no body) or one for another collection type gets 403 with `DAV:valid-resourcetype`, which RFC 5689 section 3 names for an unsupported resource type. The calendar home holds only calendars, so there's nothing else to create.

### D3: Advertise it

`DAV: 1, 3, calendar-access, extended-mkcol` and `MKCOL` in `Allow`. RFC 5689 section 3.1 asks a server to say so, and some clients check before they offer "New list".
