## Why

The weekly review is the centre of Open Loops, but its screen does not feel like a guided ritual. Seven step tabs and three phase labels share one row: on a laptop the row overflows, shows a scrollbar and cuts off its last steps, and the phase names read as stray text between the tabs. Nothing says where you are in the review, how far you have come or what comes next, and each step is a line of grey text above a bare list. People who tried it called it old and far from what a method like this should look like.

## What Changes

- The review becomes a **guided stepper**: one step at a time, in order, with a way back and a clear next step.
- A **progress indicator** replaces the tab row: three phases (Get clear, Get current, Get creative), each a group of numbered circles joined by a line, one per step, marked done (a check), current (filled) or open (with what is left). Every circle opens its step directly. It fits a 375 px screen without scrolling.
- The current step is shown in **one card** under a header with its icon and "Step 3 of 7 · Get current": its title, what is left as a badge, a short explanation, its content (the task list, the Mind sweep, the project walk) and its main action.
- **Back** and **Next: <step>** buttons below the card move through the steps, and `[` and `]` do the same from the keyboard (registered in the shortcut registry, overriding the sidebar toggle on this screen only, as Month and Timeline already do). On the last step Next becomes **Finish review**.
- Moving to a step puts focus on its title, so screen readers announce the step and its position.
- The Mind sweep prompts become chips, the project walk sits inset in the step card with key badges that follow "Show shortcut hints", and an "All clear" card closes a finished review.
- The Weekly review guide, its screenshots and the workbench stories follow the new screen.

Out of scope: the content and order of the seven steps, the definitions behind them (lib/review.ts), the project walk's decisions and keys, the Daily check and the Monthly look, and the synced `review` row. No data, sync, route or environment variable changes.

Advances the ROADMAP item `open-loops-method` (the weekly review that walks every project).

## Impact

`web/src/app/review/ReviewView.tsx` (stepper, step card, navigation), a new `web/src/app/review/ReviewProgress.tsx`, `web/src/lib/shortcuts.ts` (`review.prev-step`, `review.next-step`), `web/src/app/review/review.test.tsx`, `web/src/app/review.stories.tsx` and its baselines, `scripts/docs-screenshots.mjs` (the review shots wait for the step card), `docs/review-and-statistics.md`, new strings in the five shipped languages. No new dependency.
