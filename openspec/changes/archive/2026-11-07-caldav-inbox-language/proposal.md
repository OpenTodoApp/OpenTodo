## Why

Issue #1029: Apple Reminders showed the OpenTodo Inbox as "Inbox" even when the app is in German, where it is "Eingang". The CalDAV display name was the English word for everyone.

## What Changes

- The Inbox list's display name over CalDAV is the word the app uses in the user's language: the language chosen in Settings, else the client's `Accept-Language`, else English. Inboxes of other workspaces keep their prefix ("Work · Eingang").
- The word comes from the server's existing translation of the Inbox (the weekly digest's, `internal/mail`), kept equal to the app's catalogs by a test; no second translation source.

Out of scope: project lists keep the names the user gave them; the Inbox still cannot be renamed by a client (403); paths do not change. Not **BREAKING**: nothing stored or synced changes. A fix of the CalDAV mapping (`caldav`, ROADMAP); no new ROADMAP row.

## Capabilities

### New Capabilities

### Modified Capabilities
- `caldav-sync`: the Inbox calendar's display name follows the user's language.

## Impact

`internal/httpapi/davroutes` (`inboxName`, read once per request), `internal/mail` (`InboxName`, `TestInboxNameMatchesWebCatalogs`). Docs: `docs/caldav.md`. No dependency, size or memory change.
