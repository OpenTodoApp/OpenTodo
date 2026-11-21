# Mobile that feels native

## Why

Since 2026-11-13 the phones and tablets are served by the Kotlin and Swift shells around the web app, and the React Native app is paused. Testers who compared us with TREK (a well-liked Capacitor app whose feel comes from its web layer) and with Todoist found the app capable but not native-feeling: screens swap without motion, the back swipe does not follow the finger, presses flash during scrolls, the iOS keyboard shows WebKit's bar, a status bar tap does nothing, haptics are sparse, and tablets get a stretched phone or a squeezed desktop. This change is the plan to close that gap after 1.6.0, in small steps that each ship on their own.

## What Changes

This is an umbrella change: it holds the plan, the order and the measure of success, and names one OpenSpec change per step. Each step has its own proposal, design, delta specs and tasks and is applied and archived on its own. No code belongs to this change itself.

The steps (effort S, M or L; where it lives):

1. `page-transitions` (M, web)
2. `swipe-back-follows` (M, web; after 1)
3. `press-feedback-delay` (S, web)
4. `ios-keyboard-bar` (M, both)
5. `status-bar-scroll-top` (S, both)
6. `haptic-kinds` (S, both)
7. `touch-input-mode` (S, web)
8. `row-lift-overscroll` (S, both)
9. `focus-live-activity` (M, both; the existing change, unchanged by this plan)
10. `tablet-layouts` (L, web) and `tablet-shells` (M, both)

The umbrella adds one requirement: every step adds its rows to the device check list, so feel is checked on real devices, not only in the layout check.

## Out of scope

- The architecture: the shells plus the web app stay; no new framework or runtime.
- Removing the paused React Native app (`mobile/app`, `native-app-*` changes): its own change. Today the docs still call it paused, and `native-app-handover` still says the shells would be retired; that change needs closing or rewriting when the app is removed.
- New features: this plan changes how existing things feel.

ROADMAP.md: "Shells that feel native" (continues the list archived on 2026-11-21).

## Capabilities

### Modified Capabilities

- `native-shells`: each step's behaviour has a device check.
