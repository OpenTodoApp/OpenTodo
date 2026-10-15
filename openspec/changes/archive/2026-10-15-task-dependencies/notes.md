# Implementation notes: task-dependencies

## Smoke test (8.1), 2026-10-15

Two accounts (Ada, owner; Bob, editor) in one shared project, two Chromium contexts against a throwaway server:

- Ada opened "Book flights" (assigned to Bob, due today) and picked "Confirm dates" under **Blocked by**: the row showed "Blocked by 1" with the lock, and so did the board card.
- Bob's Today listed nothing ready and a folded **Blocked 1** group; the empty line said that one task is waiting below.
- Ada completed "Confirm dates" over the API: on Bob's screen the Blocked group disappeared and "Book flights" moved into today's rows without a reload; Bob's bell read "Ada completed Confirm dates: Book flights is ready to start" (one `unblocked` notification).
- Both contexts offline: Ada made "Task X" wait for "Task Y", Bob made "Task Y" wait for "Task X". Ada reconnected first, then Bob. The server kept Ada's edge and refused Bob's (`cycle`); both devices converged on "X waits for Y" (X dimmed, Y not).

## Decisions taken while implementing

- **The server reads the graph per `blocked_by` op**, from `scope_fields` inside the transaction, instead of loading it once per batch and overlaying accepted ops: the transaction already sees every op of the batch written before, so the overlay is exact without tracking which accepted ops won.
- **A refused `blocked_by` with no server value** falls back to an empty list on the device (like a refused assignee falls back to unassigned), so the device matches what every other device shows. `forgetRejected` now runs over every entity table (it was missing the attachments table).
- **REST refusals name the id**: `RejectedError` gained a `Detail` field carrying the blocker behind a `cycle` or `not_in_scope` refusal.
- **Calendar view** is not a task list and shows no lock; lists, boards, saved views, dashboards and the Filter view do.
- **CalDAV** keeps blockers in other calendars of the same sharing when a client sends a task back, since the client never saw them; a DEPENDS-ON naming the task itself is ignored.
- **Import**: the own export carries `blocked_by` as-is (ids are kept); CSV gains a `blocked_by` column (also `depends_on`, `waits_for`) resolved like `parent`, and Linear's `Blocked by` column is mapped (the `named-importers` profile exists), both through one final relations pass that turns outside-file and cycle references into row warnings.
- **Docs screenshots** were not regenerated: the seeded screenshot data has no dependencies, so no image changes.
