# Proposal

## Why

The Loop home (`/loop`) is correct and complete but flat: five identical cards with five equal secondary buttons, counts written as sentences, the method's cycle drawn as a grid, Today's focus as the smallest element on the page, and no sign of how the loop went over time. A home screen for Open Loops first should say in one second where you are in the loop, what the one next move is, and whether the week is going well. The statistics the app already computes on the device make the last part possible without storing or sending anything.

## What Changes

- The Loop home is re-arranged into four parts, in this order: an inline capture field (the Catch move, the same quick add the Inbox uses, replacing the dialog), the five moves on one rail in method order with a large numeral per move and exactly one move lit as the next move, Today's focus with a progress indicator, and a new **Loop pulse** with four device-computed figures for the last 14 days.
- Each move on the rail is one link to its screen; only the lit move carries the page's single primary action. A move at zero shows a done mark instead of a disabled button. Context lines on the Do move become chips that open Next.
- A closed loop (Inbox empty, every project with a next action, no rhythm due) is shown as a calm "loop closed" state instead of "Nothing to decide".
- The Loop pulse shows: tasks done this week with the difference to last week; how many of the items caught in the last 14 days have left the Inbox; the age of the oldest Inbox item; completions per day for 14 days as one small bar strip with a text alternative, and a link to Statistics. It reuses the statistics definitions, so the Loop home, Statistics and the weekly digest never disagree.
- The tagline moves out of the page body into the closed-loop state. The skeleton matches the final layout.
- No new dependency, token, icon, route, shortcut, API, op field or setting. Nothing is written or sent for any of this.

Out of scope: a Daily check streak, "days the Inbox was at zero" and time-to-decide per item (each needs history the synced rows do not carry and would be an additive field on the `review` entity, a separate change); per-context deep links into Next; changes to the Next, Waiting, Review or Statistics screens; the server, the digest, the CLI and MCP.

Advances ROADMAP.md: `open-loops-method` (the Loop home) and `stats-and-review` (statistics on the device).

No new environment variable. No change to the op log format. Not **BREAKING**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `open-loops`: the "Loop home" requirement changes from five tiles with a focus list below to the four-part layout (inline capture, the rail with one lit next move, focus with progress, the Loop pulse), with the closed-loop state and the rule that chooses the next move. A new "Loop pulse" requirement defines the four figures, their definitions in terms of the statistics capability, and that they are computed on the device.

## Impact

- Web app only: `web/src/app/method/LoopHome.tsx` (rewrite), its test `web/src/app/method/loopHome.test.tsx`, a new `loopHome.stories.tsx` with visual baselines, two pure functions beside `web/src/lib/method/rules.ts` (decided rate and Inbox age) with unit tests, reuse of `compute` and `periodFor` from `web/src/lib/stats.ts`.
- Specs: `openspec/specs/open-loops/spec.md`. Docs: `docs/method/overview.md` and `docs/method/rhythms.md` or `docs/review-and-statistics.md` where the Loop home is described, plus new screenshots `docs/images/loop-light.webp` and `loop-dark.webp`.
- Bundle: about +1.5 KB gzipped (the `Dialog` import leaves, `QuickAdd` is already in the bundle). Binary and image size unchanged.
- No API, server, sync or data-model impact.
