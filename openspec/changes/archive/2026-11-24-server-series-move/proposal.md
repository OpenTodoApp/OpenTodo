# Proposal

## Why

Issue #1991, the follow-up #1990 left out of scope: the web app refuses to move a recurring series onto a date that already has one of its records (done, skipped or moved) and says why, but a write through the REST API, `ot edit --due` or an assistant over MCP is not checked. It answers success, and a few seconds later the web app's series repair moves the date on to the next free occurrence, with nothing to say why: the bug of #1971, from another client.

## What Changes

- A server-side write that moves a series with a calendar rule onto a date with a record of its lineage is refused before anything is stored: REST answers `409 series_date_taken` with a message naming the date and whether it is done, skipped or moved; `ot` prints that message; the MCP tools answer a tool error with the same code, the date and the state. Nothing of the request is applied.
- The rule is the app's (`exceptionOn`), pinned by new cases of the shared series fixture (`web/src/lib/series.fixture.json`), so the two cannot drift.
- Any other date still moves the series, earlier ones included. A write that leaves the series' date as it is, or that trashes the record in the same request, is accepted.
- `/api/v1/sync` is unchanged: devices replaying offline history are never refused; the repair settles them as before.

## Out of scope

- Resetting a series onto a done occurrence by reopening its record in the same call (a client can trash or reopen the record first).
- CalDAV clients get the refusal as any other refused write; no CalDAV-specific message.

No ROADMAP.md item; a bug fix. No new op field, no op log change, no new environment variable.
