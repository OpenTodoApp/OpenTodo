# Design

## Context

See proposal.md for motivation. The Loop home today is `web/src/app/method/LoopHome.tsx`: one component that reads `useMethodInput()` (tasks, projects, sections, memberships, the user and the local date, live from Dexie), `useReviewRow()` and the labels, computes five tiles with `MethodRules`, `nextGroups`, `waitingTasks`, `qualifies`, `focusTasks`, `dailyDue` and `reviewDue`, and renders them as `surface-card` tiles in a 3-column grid, with Today's focus below and a `Dialog` holding `QuickAdd` for Catch. The test `loopHome.test.tsx` renders the whole `Shell` and finds tiles by `data-loop-tile`, headings by `[data-loop-tile] h2`, and buttons by their text.

Constraints that shape the approach:

- Statistics are already computed on the device by `compute()` and `periodFor()` in `web/src/lib/stats.ts` (completed per period, per day, week start from the date-time preference), rendered by `StatsContent` with a `Bars` component that prints every value and gives screen readers a list. The Loop pulse must agree with it (statistics "Two devices agree"), so it reuses these functions rather than counting again.
- The interface budget (docs/interface-guide.md) allows two rows of chrome above a list's first item, three scroll regions, no unregistered shortcut.
- Design tokens only; no raw colours or new tokens (design-system). Icons only from the vendored set; the set already has `inbox`, `list`, `layers`, `arrow-right`, `clipboard-check`, `rotate-ccw`, `circle-check-big`, `plus`.
- The Inbox is "project_id null, top-level, open" (`qualifies` in `web/src/lib/triage.ts`), so "left the Inbox" is simply "no longer qualifies".
- Docs screenshots come from `scripts/docs-screenshots.mjs`, which waits for `[data-loop-tile="do"]`.

## Goals / Non-Goals

**Goals:**
- One screen, one file, under the existing function and file size limits, built only from existing primitives (`PageHeader`, `PageBody`, `QuickAdd`, `TaskRow`, `Badge`, `Button`, `Skeleton`, `Icon`).
- Every number on the page is a pure function of the rows, so the same test vectors prove it on every device.
- Keep the existing test hooks (`data-loop-tiles`, `data-loop-tile`, an `h2` per move, `data-loop-focus`) so the Shell tests and the screenshot script need only text changes.

**Non-Goals:**
- No change to the method rules (`rules.ts`), `stats.ts`, the Statistics screen, the review row, the digest or the server.
- No chart library; the strip is fourteen divs.
- No new history or streak data (see proposal, out of scope).

## Decisions

**D1. Four stacked parts instead of a grid of equal cards.** Capture, rail, focus, pulse, in that order, each a `section` with its own heading; the rail is a `ul` with one `li` per move. Alternative: keep the five cards and only add colour. Rejected: the cards' sameness is the problem, and the orphan slot stays.

**D2. The capture field is `QuickAdd` inline, as in the Inbox view.** `onAdd` calls `createTask` with `project_id: null`, so the task qualifies for the Inbox; `QuickAdd` already keeps focus after an entry. The `Dialog` and the `catching` state go away. The header plus the field is two rows of chrome above the first interactive row of the rail, inside the budget. The `q` shortcut is not changed: it already opens quick add globally and would focus this field when the Loop home registers it the way the Inbox does; if that proves intrusive the field simply takes `autoFocus` false and `q` keeps its current behaviour. No new shortcut.

**D3. One "next move", chosen by a pure function.** `nextMove(counts): MoveId` returns the first of `clarify` (inbox > 0), `place` (withoutNext > 0), `review` (dailyDue || weeklyDue), `do` (nextCount > 0), else `catch`. Only that move's `li` gets the accent-soft surface and the primary `Button`; the others are plain links (`<a>` to the route, so Tab and Enter work) with a ghost chevron. Alternative: compute "urgency" per move and sort. Rejected: method order is the point; the user learns the loop by reading it in order every day.

**D4. Numerals, not sentences.** Each move shows `<span class="text-h1 font-semibold tabular-nums">n</span>` with the unit in `text-meta text-muted`. The i18n strings keep their plural forms for the unit ("in the Inbox", "to decide", "next actions"), and the full sentence stays as the `aria-label` of the link so screen readers hear "8 in the Inbox, Catch" as before. A move at zero with nothing due renders `<Icon name="circle-check-big">` in `text-success` with the done text ("Inbox is empty", "Every project has a next action").

**D5. Colour by meaning, from existing tokens.** Next move: `border-accent bg-accent-soft` with `text-on-accent-soft` (the same pair the method mode chooser uses). Done: `text-success`. Due rhythm: `Badge hue="orange"` is replaced by a dot `bg-warning` plus `text-on-warning-soft` text, which the pairs file already lists. New pairs, if any, go in `src/ui/tokens/pairs.ts` first.

**D6. Focus progress as inline SVG.** A 18 px ring (`circle` with `stroke-dasharray`) in `text-accent` over `border-default`, plus "n of m done" as text; the ring is `aria-hidden`, the text carries the meaning. Completed focus tasks keep their row (struck through) until the day changes, so the count can reach "3 of 3"; this differs from `focusTasks`, which drops completed tasks, so the section reads the stored ids with `storedFocus` and resolves them itself, still filtering deleted ones. Alternative: a progress bar. Rejected: the ring is 12 lines and reads at a glance beside a short heading.

**D7. The Loop pulse reuses the statistics module.** `periodFor('this-week' | 'last-week', today, weekStart)` and `compute(input, period, weekStart)` give "done this week" and the delta; for the 14-day strip a `Period` of `{start: today-13, end: now}` is passed to `compute`, whose `perDay` is the strip. Two new pure functions live in `web/src/lib/method/pulse.ts`: `decided(tasks, today, days = 14): {decided, caught}` and `inboxAge(tasks, today): number | null` (null = empty), with `today` and `created_at` compared on local days through the same `dayOf` the statistics use. `weekStart` comes from `useDateTimeFormat().resolved.weekStart` as in `StatsView`. The strip is fourteen `div`s with `height` as a percentage of the maximum, `bg-accent` (the `border-default` colour for a zero day), 2 px gaps, the current week's total printed, each bar focusable with its value as a `Tooltip`, and an `sr-only` list of the fourteen values (the `Bars` component's approach, which is not reused because its labels and layout are built for a full-width chart).

**D8. Skeleton with the final shape.** `Skeleton` rows sized like the field, the rail and the focus list, so nothing shifts when data arrives.

**D9. Stories and baselines.** `loopHome.stories.tsx` under `Screens/Loop home` with two stories, "Busy morning" and "Loop closed", seeded through `withSeed` and `withClock` from `app/stories/fixtures.tsx`, giving light/dark × 375/1280 baselines and the axe gate.

## Data model

No change. Reads: `task.created_at`, `completed_at`, `project_id`, `parent_id`, `deleted_at`, `due`, `labels`; `review.daily_at`, `completed_at`, `monthly_at`, `focus_date`, `focus`. Writes: only the ones the controls already make (create task, complete task, navigate). No op field added, renamed or removed.

## Size and resources

No dependency. Web bundle about +1.5 KB gzipped (new markup and the pulse functions; the `Dialog` import leaves this screen). Container image, binary and runtime memory unchanged. The pulse computes `compute()` three times per render over the live tasks, memoised on the inputs; `StatsView` does this once per period today without trouble, and the Loop home already iterates the tasks for its rules.

## Interface budget

- Rows of chrome above the first item: header, capture field (2 of 2). The rail is content.
- Task properties visible by default: focus rows use `TaskRow` unchanged (project chip only).
- Primary sidebar destinations: unchanged.
- Vertical scroll regions: the content column only (1 of 3).
- Shortcuts: none added; `q` keeps its registered meaning.

## Risks / Trade-offs

- [Five columns are tight at the 48 rem list width] → the rail is five columns from 40 rem up and three columns (3 + 2 with the last two centred by `col-span`) below that, then one column below 480 px; the story at 375 px and the 360 px scenario cover both breaks.
- [Long translations (German "Projekte ohne nächste Aktion") break the unit line] → the unit wraps under the numeral; the Storybook language switch is used to check German and French in the review of the baselines.
- [The strip's maximum is one busy day, flattening the rest] → acceptable for 14 days; the per-day values are printed in the text alternative and on hover, and Statistics has the full charts.
- [Tests that match "7 in the Inbox" as one string] → the test reads the move's `aria-label` (the full sentence) rather than `textContent`.
- [The `q` shortcut focusing the field on the Loop home changes a habit] → it matches the Inbox view, where `q` focuses the inline field; documented in the keyboard page if the wording needs it.

## Migration Plan

Pure UI. Ships with the web bundle; no data migration, nothing to roll back beyond reverting the commit. The docs screenshots are regenerated with `make docs-screenshots` (`loop` only).
