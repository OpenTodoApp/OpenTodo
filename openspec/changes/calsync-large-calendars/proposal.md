# Proposal

## Why

A connection to a busy Google Workspace calendar stops with "The calendar server sent more than 4 MB at once" (`too_large`, issue #1226). Every answer from a calendar server is read into memory up to 4 MB, and a cycle asks for whole calendars in one answer: the events of the shown calendars over the whole store window (two months back, about thirteen months ahead) with their full iCalendar text, and on the first sync, the listing of every event the calendar ever had. A calendar with a few thousand events, or years of history, is over 4 MB in one answer, so it never syncs.

Raising the limit would only move the wall and give up the memory bound per answer the limit exists for.

## What Changes

- **Events in pieces:** the events of a shown calendar (and the target calendar's other events) are read with one `calendar-query` over the window as before; an answer over 4 MB is read again as two halves of the window, and so on down to a day; a day still over 4 MB is listed by ETag and read with `calendar-multiget` in batches of at most 50, halving a batch whose answer is too large. An event that falls into several pieces is kept once.
- **Changes of a large calendar:** when the listing of changes (`sync-collection`, or the ETag listing on servers without it) is over 4 MB, the cycle reads back only the events OpenTodo wrote, by `calendar-multiget` in batches, and continues from the calendar's current sync token: an event that is gone is handled like a deleted one, a changed ETag like a changed event. The next cycle reads only what changed since.
- **Read-back in batches:** a batch of changed events whose answer is over 4 MB is halved until it fits.
- A single event over 4 MB still stops the cycle with `too_large`.
- **Docs:** `docs/calendar-sync.md` says how large calendars are read.

## Capabilities

### Modified Capabilities

- `calendar-sync`: "Connected calendars in Day and Week" and "Calendar changes come back to the task" gain the bounded reads.

## Out of scope

A configurable limit; RFC 6578 paging of truncated `sync-collection` answers (507); Microsoft Graph, whose answers are already paged by Microsoft.

## Roadmap

A fix outside the roadmap's milestones (issue #1226).
