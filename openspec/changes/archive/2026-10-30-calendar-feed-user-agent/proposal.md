# Proposal

## Why

Microsoft Exchange on-premises publishes a person's calendar as an `.ics` address in Outlook on the web (OWA). Its server answers HTTP 400 to any User-Agent that is not a full desktop browser string, so a subscription to it fails with `http_400` and the calendar can never be shown (#622, diagnosed by the reporter with a full User-Agent matrix: `OpenTodo/<version>`, `curl`, a bare `Mozilla/5.0` and calendar-app names are all refused; Chrome and Firefox desktop strings are accepted).

## What Changes

- Calendar subscription fetches keep identifying as `OpenTodo/<version>` by default.
- When a feed answers **400, 403 or 406** to that, the same request is sent once more with a fixed browser-compatible User-Agent. No other status is retried, and never more than once per fetch.
- When the retry succeeds (200 or 304), the subscription remembers it on the server, and later fetches send the browser User-Agent directly. Changing the subscription's address forgets it.
- The calendar feeds guide gets a troubleshooting note for Exchange on-premises.

No new environment variable, no op-log change, no API change. A new server-side table (migration 0050), never synced.

Out of scope: calendar sync (`internal/calsync`) and issue connections (`internal/issues`) keep their User-Agent (see design); a setting to choose the User-Agent per subscription.

Advances no ROADMAP.md row: a bug fix for #622 in `calendar-feeds`.

## Capabilities

### Modified Capabilities

- `calendar-feeds`: the outbound fetch gains the User-Agent fallback.
