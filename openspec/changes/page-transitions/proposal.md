# Forward and back page transitions

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

Moving between screens swaps them at once; `mobile/AUDIT.md` lists "No transitions between screens". The app already uses View Transitions for list reflow (`motion.ts:243-297`) and has motion tokens (`--duration-emphasis` 250 ms, `--ease-spring`), so pages can move the same way native stacks do.

## What Changes

- `navigate()` in `router.ts` runs the route change inside `document.startViewTransition` when supported and motion is allowed, with a direction: forward (deeper: a project, a task page, a note) slides the new page in from the end edge, back slides it out; a switch between top-level destinations cross-fades.
- The sidebar, the bottom bar and the page header outside the page body keep their place (`view-transition-name` on them).
- Reduced motion, `data-motion="none"`, a focused text field and a hidden tab skip it, as reflow does today.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Shared-element transitions (a row growing into its task page).
- Transitions for overlays (they have their own).

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `web-app`: page changes move with a direction.
