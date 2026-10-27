# Design

## Context

See proposal.md, "Why". The CalDAV write path is `davroutes.(*davRequest).put` → `caldav.Decode` → an `Inbound` (task fields, the date shape, alarms, client data) → ops through `ApplyStrict` with device `caldav:<app-password-id>`. `Decode` picked the master `VTODO` and refused a `VEVENT` with `ErrUnsupportedComponent`, which became `403 supported-calendar-component` (`write.go`). The endpoint refuses accounts with end-to-end encryption altogether (`dav.go`). Nothing here changes that.

## Goals / Non-Goals

**Goals:**
- An event saved or moved into an OpenTodo calendar becomes a task, with no data loss.
- One write path: an event produces the same `Inbound` a to-do produces, so creating, updating, moving between calendars, alarms, recurrence, client data and convergence all behave as they do for to-dos.

**Non-Goals:**
- Serving events. Collections keep advertising `VTODO` only.
- Per-occurrence overrides of recurring events.
- Mapping free-text locations onto map locations.

## Decisions

### D1. The decoder reads a VEVENT as the task's master component

`masterTask` accepts `VTODO` or `VEVENT` as the master, and still refuses `VJOURNAL` and `VFREEBUSY`. An object holding both kinds, or several UIDs, is `valid-calendar-object-resource` as before. The properties go through the same `decoder.prop` switch, so everything a to-do maps maps the same way for an event: `SUMMARY`, `DESCRIPTION`, `PRIORITY`, `CATEGORIES`, `RELATED-TO`, `CREATED`, `RRULE`, `VALARM` and `X-OPENTODO-*`. Every other property is kept as client data, which a task app sees again.

**Alternative:** a separate event decoder. Rejected: it would duplicate the mapping and drift from it.

### D2. Timing: the start is the due date; a timed event's length is the estimate

| Event | Task |
|---|---|
| `DTSTART;VALUE=DATE` (all-day) | due date, no time, no estimate |
| `DTSTART` with a time (UTC, `TZID`, or floating) | due date and time, zoned exactly as a to-do's `DTSTART`/`DUE` |
| `DTEND`, or `DURATION`, on a timed event | estimate in whole minutes (rounded up) when positive and at most one week; otherwise none, and the object is still accepted |
| `DTEND` or `DURATION` on an all-day event | ignored: a multi-day event is one task on its first day |
| `RRULE` | the task's repeat rule when `recurrence.FromRRULE` maps it, otherwise client data, as for a to-do |
| `STATUS:CANCELLED` | completed, as for a to-do |
| `STATUS:CONFIRMED` / `TENTATIVE` | open; not kept |
| `TRANSP`, `DTEND`, an event's `DURATION` | not kept: they're `VEVENT`-only, or replaced by the estimate, and would make the served `VTODO` invalid |
| `LOCATION`, `URL`, `ATTENDEE`, `X-APPLE-*`, … | client data: served back inside the `VTODO`, as today for to-dos |

The decoder marks the object as having a duration, so the existing date table reads it as a scheduled block (`ShapeStartDuration`): `Due` is the `DTSTART`, and no `DTSTART` is kept as client data. The served `VTODO` then has `DUE` equal to `DTSTART` (`ShapeStartDueEqual`), the form the server already writes for a timed task.

An over-long or negative event length doesn't refuse the object, unlike a to-do's explicit `ESTIMATED-DURATION`. Refusing would bring back the data loss this change removes.

### D3. Served back as a VTODO; collections don't advertise VEVENT

After the write, the resource exists as a task and every fetch returns a `VTODO`, keeping the name and UID the client chose (the existing resource-name mapping). A calendar app therefore drops the item from its calendar view on its next sync, and task apps show it.

Advertising `VEVENT` in `supported-calendar-component-set` would invite calendar apps to treat these lists as event calendars and expect events back. They would then see their event turn into something else on every sync. The collection stays a task list; accepting an event is a fallback that prevents data loss.

### Data model, size, interface budget

- **Data model:** none. No op field, migration or schema change. The task fields and ops are the ones a to-do write produces.
- **Binary size:** a few dozen lines in `internal/caldav`; no dependency.
- **Interface budget:** no screen change.

## Risks / Trade-offs

- **[The item vanishes from the calendar view]** A person who expected an event in iOS Calendar sees it move to Reminders. → `docs/caldav.md` says so and recommends Reminders for new items. It still beats today's silent loss.
- **[Repeated edits from a calendar app before it resyncs]** The app may PUT the event again with its own changes. → They're applied through the same mapping and per-field ops, so the task follows. `TestEventsBecomeTasks` covers it.
- **[Recurring events with overrides]** Overrides are dropped, as for to-dos; the series itself is kept.
