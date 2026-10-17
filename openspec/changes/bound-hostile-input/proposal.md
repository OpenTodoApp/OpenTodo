# Bound hostile input in calendar parsing, MCP batches and feed expansion

## Why

The audit (INT-1, INT-5, INT-2) found three places where a small request costs the server far more CPU or memory than it should:

- Unfolding iCalendar content lines re-copied the growing line for every folded continuation, so a 1 MB CalDAV `PUT` made of continuation lines took about 30 s of CPU, and a 2 MB subscribed calendar about 100 s. The content-line limit was checked only after unfolding.
- The MCP endpoint answered JSON-RPC batches of any length: one 1 MB body could hold thousands of tool calls, and the combined answer had no size bound. Batching exists only in MCP revision 2025-03-26; later revisions removed it.
- Calendar subscriptions expanded every recurrence rule from its `DTSTART`, up to 20,000 periods per event, before keeping the ones in the window. A feed of 2,000 daily events starting in 1980 took about a minute and many gigabytes of allocation inside the create/update request. The same walk also meant a daily series started before about 1972 ran out of periods before reaching today and showed nothing.

## What Changes

- iCalendar unfolding is linear in the input. A logical content line is at most 64 KB and the physical lines before unfolding at most eight times the content-line limit; over either, the body is refused like any other invalid calendar data (CalDAV `PUT`: 400/415 as today; subscriptions: `invalid_calendar`).
- The MCP endpoint refuses a JSON-RPC batch with `-32600` (HTTP 400) when the request declares `MCP-Protocol-Version` 2025-06-18 or later. Without the header, or with 2025-03-26, a batch holds at most 20 messages (more: `-32600`, 400), and once the replies reach 4 MB the remaining requests are not run and each gets a `-32603` error asking the client to send it on its own.
- Recurrence expansion of a rule without `COUNT` starts at the window instead of at `DTSTART`. One calendar's whole expansion shares a work budget (500,000 rule periods and starts) and a 5 s deadline; when either runs out, the occurrences found so far are kept and the subscription shows a warning.

Not **BREAKING**: no new environment variable, no op log change. Real calendars are far below the new limits; an MCP client that sends batches under 2025-06-18 or later was already outside that revision.

## Out of scope

- The other INT findings (push reminders, CalDAV per-request loading, backups).
- A per-subscription event cap or streaming parse of feeds.
- Changing the stored occurrence window or the 5,000 occurrence cap.

ROADMAP: hardening of existing features (CalDAV, MCP server, calendar feeds); no ROADMAP item names this change.

## Impact

- Changed: `internal/caldav/ical.go`, `internal/mcp/server.go`, `internal/httpapi/mcp.go`, `internal/calfeed/expand.go`, `internal/calfeed/fetch.go`, tests beside them, `docs/mcp.md`, `docs/caldav.md` / calendar feed docs where limits are listed, `CHANGELOG.md`.
- No data model, client or dependency change.
