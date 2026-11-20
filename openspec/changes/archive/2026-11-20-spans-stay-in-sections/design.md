## Context

`splitLater` (`web/src/lib/listGroups.ts`) splits a project's tasks, or one section's, into active and Later. It uses `inLater` from `views.ts`: someday, or a start after today. Subtasks follow their top-level task. `spanOf` (`web/src/lib/span.ts`) returns the span a task is drawn as, or null. Today, Anytime and the sidebar counts use `isActive` / `isDeferred` directly and never go through `splitLater`.

## Goals / Non-Goals

**Goals:** a span placed in a section stays visible there; no other list changes.

**Non-Goals:** a setting; changing what Today, Upcoming, Anytime or the counts show; the #936 rework.

## Decisions

### D1. Only the project list changes

`splitLater` sends a top-level task drawn as a span to the active part, even before its first day. A span that is also someday (`start` is `someday`) is not drawn as a span, because `spanOf` needs a date, so it stays in Later. The span's subtasks come with it, as they do with every top-level task.

`isDeferred` stays as it is, so Today, Anytime and the counts keep a future span out until its first day. That matches what the user expects of an event-like task: it shows on its days, not before.

### D2. The chip already says when

A span in the active list shows its range chip (`24–26 Nov`), as it does in every list (`multi-day-tasks` "range chip replaces the date chip"). No "Starts" chip and no new string are needed.

### D3. Ordering

The span is sorted with the section's other active tasks by the list's sort, as a dated task is. It is not pinned to the top or the bottom.

**Alternative considered:** a per-project "Show Later" switch (the issue's second idea). The owner ruled it out, and it would add a setting to fix one case.

## Risks / Trade-offs

- **A long span is visible weeks early in its section.** That is the point. It is still out of Today and the counts, so nothing becomes urgent early.
- **Size.** A few lines in one function, plus tests.

## Interface budget

No new control, string or screen. Only a task moves from a folded group into its section.
