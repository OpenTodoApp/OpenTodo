## Context

The weekly review (`open-loops-method` D6) put seven steps in three phases on the `Tabs` primitive with a `group` per phase. Tabs suit a few peers you switch between; a review is a sequence you walk through once a week. The row also costs most of its width to labels, so at common widths it scrolls.

## Goals / Non-Goals

**Goals:** the review reads as a sequence with a beginning and an end; you always see where you are and what comes next; it looks the same at 375 px and 1280 px without horizontal scrolling; everything stays reachable from the keyboard.

**Non-goals:** changing what each step contains or how it is counted; changing the project walk's decisions or keys; a separate overview screen.

## Decisions

### D1. A progress indicator instead of tabs

`ReviewProgress` renders an ordered list of three phase groups. Each group has the phase name and one numbered circle per step, joined by a thin line: the current step is filled with the accent and a soft halo, a done step shows a check on the soft accent, an open step is outlined with its number and a small bubble with what is left. The connecting line turns to the accent between finished steps. Each circle is a 32 px button that opens its step; the current one carries `aria-current="step"`, and every accessible name gives the phase, the step and its state ("Get clear: Inbox, 3 left"). From 640 px the step's name is shown under its circle. Phase groups take widths in proportion to their step counts (2, 4, 1) but never below their name, so the track fits 375 px.

Alternatives: a vertical rail of steps beside the content (rejected by the person who asked for the redesign in favour of the stepper; it also halves the list's width on a laptop) and an overview of step cards (adds a screen between you and the work).

### D2. One step card, navigation below

The step's content sits in a `Card`. Its header, on a soft accent tint, has the step's icon in a tile, "Step 3 of 7 · Get current" as an eyebrow, the step title (`h2`, focus target, `tabIndex=-1`) and a badge with what is left or "Done"; below it the explanation, then the content and the step's own action (Process the Inbox, See statistics). The Mind sweep's prompts are chips; the project walk's card sits inset on the sunken tone inside the step card, its key badges follow "Show shortcut hints", and its back button is named "Previous project" so it is not confused with the step's Back. Under the card a bar holds **Back** (ghost, hidden on the first step) and **Next: <step>** (primary, full width on a phone); on the last step it is **Finish review**. When every step is done, or the review was just finished, an "All clear" card above the stepper closes the ritual. The header keeps **Finish review** for finishing early, and the Daily check and Monthly look in its menu.

### D3. Keyboard

`[` and `]` move to the previous and next step (`review.prev-step`, `review.next-step`, scope `view`, view `review`, overriding `global.sidebar` like `month.range-prev`). They are paused while a dialog is open, as the list keys are. The list keys still work inside list steps; the walk keeps `r q Enter a j k`. Changing step moves focus to the new step's title. The previous behaviour (arrow keys across tabs) goes away with the tabs; the progress segments are ordinary buttons in the tab order.

### Interface budget

Chrome above the first task stays at two rows: the page header and the progress indicator; the step card's header is content inside the card, like a list's group header. No new scroll region (the card grows with the page). Task rows are the ordinary `TaskRow`, so the seven-property limit is unchanged. Sidebar destinations are unchanged. The two new shortcuts are registered with `overrides: ['global.sidebar']` and pass the registry's conflict test.

### Data, size and memory

No data model change: no new op field, no change to the `review` row or `project_prefs`. No dependency; the new component is a few hundred bytes gzipped and the `Tabs` primitive keeps its `group` support for other screens.

## Risks / Trade-offs

- People used to the arrow keys between steps lose them → `[`/`]` and the Next button replace them, and the cheat sheet lists them under Review.
- Segments are small touch targets on a phone → each segment's button is at least 24 px tall with the bar drawn inside it.
