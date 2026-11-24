# Touch input mode: no hover look and no focus ring after a tap

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

Eight raw `:hover` rules in `index.css` are not guarded by `(hover: hover)` (`:937`, `:976`, `:1067`, `:1203`, `:1426`, `:1560`, `:1570`, `:1880`), so a tap leaves a hover look stuck on iOS. `.ui-input` draws its ring on `:focus` (`index.css:807-810`), and a tap on a control that keeps focus can leave a ring that looks like a keyboard focus. `data-keyboard` (`lib/keyboardSeen.ts`) only ever turns on and is used for key hints.

## What Changes

- Every raw `:hover` rule in the web app is guarded by `@media (hover: hover)` (or the `pointer-fine:` variant), and a repo check keeps it that way.
- The page tracks the last input: `data-input="touch"` after a touch, `"keyboard"` after a key that only a hardware keyboard makes, `"pointer"` after a mouse or trackpad. Focus rings draw for keyboard and pointer focus as today and not after a tap; `data-keyboard` keeps its meaning for key hints.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Changing which elements show a focus ring for keyboard users (unchanged).
- The high-contrast focus outline (unchanged).

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `design-system`: hover looks need a hover-capable pointer; focus rings follow the last input.
