# Design

## Context

Four defects from a reading of the remaining screens (the proposal). None needs a new part: each is a condition or a class on what exists.

## Goals / Non-Goals

**Goals:** a phone can open a feed row, see the habit controls, move the timeline's range, and grab a label's handle.

**Non-goals:** the Timeline's bars, a Board, Process the Inbox, tooltips that carry facts.

## Decisions

**D1. "By touch" is `(pointer: coarse)`, as the Timeline's names already decide.** `TimelineView` opens a task on a tap of its name when `useMediaQuery('(pointer: coarse)')` holds (`TimelineView.tsx`). The feed uses the same test, so the two screens agree, and a tablet behaves as a phone. Not the phone screens' switch: these are about the pointer, not the width.

**D2. The feed's row ignores taps on its own controls.** The row's handler opens only when the tap's target is not inside an `a` or a `button`, so the title and the project keep their own meaning and nothing opens twice.

**D3. The habit controls use `pointer-coarse:opacity-100`.** The controls are hidden by `opacity-0` and shown by `group-hover`; the variant adds the coarse case. `.hover-reveal` (index.css) would do the same but also changes the fine-pointer rule's specificity for these two; the variant is the smaller change.

**D4. The timeline's buttons are the calendar's range group.** The same three `Button`s (`ghost`, `sm`) as `CalendarView`'s Previous, Today, Next, named Earlier and Later because the timeline's step is not a named unit. They call the handlers the shortcuts call. Shown on every device: a control for a function that had none is not a phone-only need.

**D5. Budget, data, size.** One group of three buttons in the timeline's own control row, which already exists: no new row of chrome (`docs/interface-guide.md`). No data, no dependency.

## Risks / Trade-offs

- **A tap that meant to scroll opens a row.** → a tap is a click; a scroll does not produce one.
- **A hybrid laptop** reports a fine main pointer and keeps the mouse behaviour, which is right for its trackpad and leaves its touch screen with select-then-open on the feed, as today.
