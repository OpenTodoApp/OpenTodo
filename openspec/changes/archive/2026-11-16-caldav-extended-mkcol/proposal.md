## Why

Creating a list in iOS Reminders or Planify fails with `405 method not allowed` (#1432). Both clients create a new calendar with extended `MKCOL` (RFC 5689) instead of `MKCALENDAR`. The CalDAV endpoint only accepts `MKCALENDAR`, so the request never reaches the code that creates a project.

## What Changes

- An extended `MKCOL` whose `resourcetype` names a calendar creates a project exactly like `MKCALENDAR` does: the same display name, colour, component check, workspace and sync-scope rules, and the same answers when the name is taken.
- A `MKCOL` for anything other than a calendar, or a plain `MKCOL` without a body, is refused with 403 and the `DAV:valid-resourcetype` precondition. Only calendars exist here.
- The `DAV` header adds `extended-mkcol`, and `OPTIONS` lists `MKCOL`, so clients that check for it find it.

## Capabilities

### Modified Capabilities

- `caldav-sync`: Calendar management also accepts extended `MKCOL` for a new calendar.

## Impact

- `internal/httpapi/davroutes`: the method switch and the `MKCALENDAR` handler, which now also reads a `DAV:mkcol` body.
- `docs/caldav.md`: the supported methods.
- No new dependency, route, op field or setting.
