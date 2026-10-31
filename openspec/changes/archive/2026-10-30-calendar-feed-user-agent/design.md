# Design

## D1. Identify honestly first, fall back once

`Fetcher.Fetch` sends `OpenTodo/<version>` as before. 400, 403 and 406 are the statuses a server uses when it refuses a client by its headers; on one of them the fetch closes the response and sends the same conditional GET once more with `calfeed.BrowserUserAgent`, a fixed modern desktop Chrome string kept in one constant with a comment explaining why (#622: Exchange wants `Mozilla/5.0`, a platform in parentheses, an engine token and a browser version; anything shorter, or an app name in front, is refused). The answer to the second request is the outcome of the fetch, so a feed that answers 400 to everything still fails with `http_400` after exactly two requests. 401, 404, 5xx and transport errors are never retried. The retry goes through the same outbound client, so the private-network rule, redirects and timeout apply to it unchanged.

## D2. Remember it per subscription, server-side

The fetch result carries `BrowserAgent`. On success the store records the subscription in a new side table `calendar_feed_browser_agents(subscription_id PRIMARY KEY, created_at)` (migration 0050; a side table because SQLite cannot repeat `ALTER TABLE ADD COLUMN`, as 0047 notes). Subscriptions are server-side rows already, not synced ops, so this is the natural place; the flag is read with the subscription (`EXISTS` in the column list) and never serialised to the API. A failed retry records nothing, so a feed that is simply broken is not switched. A URL change deletes the row; deleting the subscription cascades. Otherwise the flag stays: a server that accepts the browser string has no reason to be asked with the OpenTodo one again.

## D3. Other outbound clients

Calendar sync (`internal/calsync`, CalDAV and the Google Calendar API) and issue connections (`internal/issues`, GitHub and GitLab APIs) talk to API endpoints that expect a client User-Agent (GitHub requires one); Exchange's check applies to the OWA published-calendar pages, which only calendar feeds read, and Exchange offers no CalDAV. They are left unchanged. If a similar report arrives for them, the same constant and the same once-only rule can be shared.

## Data model and size

No op field; one new server-side table with at most one row per subscription. No dependency; binary size and memory unchanged. No screen changes.
