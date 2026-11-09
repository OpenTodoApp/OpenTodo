# Proposal

## Why

Setting up Google Calendar sync means a trip through the Google Cloud console, and the guide described it in a few lines with the console's old names. Server owners got stuck on the same steps: enabling the Calendar API instead of the CalDAV API, missing test users, a redirect address that does not match, and access that ends after 7 days in Testing. When the sign-in failed, the panel said "the permission was not granted" or a bare reason, whatever the cause ([#1047](https://github.com/OpenTodoApp/OpenTodo/issues/1047)).

## What Changes

- `docs/calendar-sync.md`: a step-by-step set-up of the Google client for the console as of November 2026 (Google Auth Platform: Branding, Audience, Data Access, Clients), and a "Fix a failed Google connection" section for `redirect_uri_mismatch`, a wrong address behind a proxy, "Access blocked" and unverified apps, the calendar permission unticked, the CalDAV API not enabled, a refused client and the 7-day expiry in Testing.
- The Google sign-in names its cause. The callback maps Google's `error` (`access_denied` → `denied`, `redirect_uri_mismatch`, anything else → `authorization_failed`); the code exchange tells a refused client (`google_client_refused`) and a refused redirect address; a token without the calendar scope is `scope_not_granted`; a `403` from Google's CalDAV right after the grant is `caldav_api_disabled`.
- `POST /api/v1/calendar-sync/google/start` refuses with `409 base_url_mismatch` when the page's `Origin` is not the origin of the redirect address, before sending the person to a Google error page.
- The panel shows each result as a translated message with **Learn more**, which opens the guide at the section that fixes it.

No new environment variable, no op or data change. Not **BREAKING**: earlier results keep their names, and `denied` still means Google refused.

## Capabilities

### Modified Capabilities

- `calendar-sync`: "Connecting Google" names the cause of a failed sign-in and refuses a start whose redirect address is not the page's.

## Impact

- `internal/calsync/google.go` (results, scope check, exchange errors), `internal/calsync/dav.go` (the refusing status on the error), `internal/httpapi/calsync_handlers.go`.
- `web/src/app/CalendarSyncPanel.tsx`, `web/src/lib/i18n/errors.ts`, the catalogues.
- `docs/calendar-sync.md`, `docs/api.md`.

Out of scope: the same mapping for Microsoft (it already names admin consent) and for the background cycle's 403s (a connection that worked and later gets a 403 still asks to reconnect). Screenshots of Google's console. Advances no open ROADMAP item.
