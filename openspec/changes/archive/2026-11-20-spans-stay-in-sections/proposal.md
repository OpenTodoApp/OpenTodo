## Why

Issue #1572. Since 1.3.0, a task with a future start date is deferred: in a project it sits under its section's folded **Later**, away from the work at hand. For a plain start date ("don't show me this before the 24th") that is what the user asked for. A multi-day task is different. Its start is the first day of something the user placed on the calendar (a conference from 24 to 26 November), not a request to hide it. Today such a span disappears into Later as soon as it is created. The reporter stopped using sections because of it.

The owner's answer on the issue stands: start dates keep deferring, and no switch is added. This change only stops treating a span's first day as "hide until then" in the project list.

## What Changes

- In a project view, a task drawn as a span (OpenSpec `multi-day-tasks`: `span` on, start before the do-on date) stays among its section's active tasks with its range chip (`24–26 Nov`), and is never listed under Later.
- Everything else about a span before its first day stays as it is:
  - it is absent from Today, Anytime and the sidebar counts;
  - Upcoming lists it once, under its first day;
  - the calendar draws it as a bar.
- A start date without a span still defers, exactly as today.

Out of scope: a per-project switch for Later; the wider Start / Deadline / Do on rework (#936).

No **BREAKING** change: no op field, no setting, no new string.

Roadmap: a follow-up of `multi-day-tasks`, listed as `spans-stay-in-sections`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `start-dates`: "Deferred tasks". A span stays in its section in the project view.

## Impact

- `web/src/lib/listGroups.ts` `splitLater` (the one place a project list splits Later), using `spanOf` from `web/src/lib/span.ts`.
- Tests in `web/src/lib/listGroups.test.ts` and the project list.
- One sentence in `docs/deadlines-and-start-dates.md` and `docs/tasks-that-span-days.md`.

No server change, no dependency, no bundle change worth measuring.
