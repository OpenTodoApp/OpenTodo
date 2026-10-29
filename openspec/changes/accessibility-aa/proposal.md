# Proposal

## Why

A task manager is used every day, for hours, by people with every kind of ability. Public bodies, schools and many companies in the EU must buy accessible software (the European Accessibility Act applies from June 2025; EN 301 549 references WCAG), and individuals who rely on a screen reader or a keyboard have few task apps that work for them. OpenTodo already has strong pieces:

- an axe gate on every workbench story (`design-system` "Accessibility gate on stories");
- a focus-ring walk over the core screens;
- target-size and other measures in the interface audit tour, which runs nightly and only reports;
- an accessible docs site.

But nothing covers the real screens with real data as a blocking check. There's no manual screen-reader pass, and there's no public statement of what conforms. For 1.0 "Trust" the claim must be specific: **WCAG 2.2 Level AA, these screens, tested this way, these known exceptions**.

## What Changes

- **A conformance statement**, `docs/accessibility.md`, in the W3C statement format. It states the standard (WCAG 2.2 AA), the version and date, and the scope:
  - every entry of the screen inventory (`scripts/ux-audit/screens.json`, 99 entries today, 57 core);
  - the docs site and in-app Help;
  - the native screens of the Android and iOS shells;
  - the browser extension popup.

  It also states the testing method, a per-screen results table, known exceptions with workarounds and target versions, and a feedback channel with a response time.
- **Blocking axe on real screens.** The interface audit's axe pass becomes a gate:
  - **On every pull request that touches `web/`:** every inventory entry at 360 px and 1280 px, light and dark, English, with zero serious or critical violations of the WCAG 2.0/2.1/2.2 A and AA rules.
  - **Nightly:** the full matrix (360/768/1280, English and German, browser text size 20).
- **Checks for what axe misses**, made blocking on the same run:
  - target size (2.5.8, the audit's existing M7 measure);
  - focus visible (2.4.7) and focus not obscured (2.4.11) on every screen, not only stories;
  - reflow at 320 CSS px (1.4.10), with the two-dimensional views (calendar grids, timeline, board) as the only listed exceptions;
  - text spacing (1.4.12);
  - accessible authentication (3.3.8): paste allowed and `autocomplete` set on password, one-time-code and recovery fields.
- **Dragging alternatives (2.5.7).** Every drag interaction has a single-pointer alternative:
  - task and section reorder;
  - board moves;
  - calendar block move and resize;
  - timeline bars;
  - sidebar order;
  - saved view order.

  A test fails on a drag source without a listed alternative.
- **Manual audit before 1.0 and every 12 months**, recorded per core screen in `docs/accessibility/audit-<version>.md`. The passes are:
  - keyboard only;
  - NVDA with Firefox on Windows;
  - VoiceOver with Safari on macOS;
  - VoiceOver in the iOS shell;
  - TalkBack in the Android shell;
  - 200% zoom with text size 20.

  `release-prepare` refuses a release when the record is older than 12 months or has an unresolved failure that isn't listed as an exception.
- **Native shells.** Android lint's accessibility checks become errors, and the iOS UI test runs the XCTest accessibility audit on the native screens (sign-in to a server, settings, widgets configuration).
- **Fixes.** Everything the audit finds on core screens is fixed before 1.0. Failures left on non-core screens are listed as exceptions with an issue and a target version, and none of them may be a Level A failure.

No new environment variable, no runtime dependency (axe-core is already a dev dependency), no op schema change. Not **BREAKING**.

## Out of scope

- WCAG AAA (contrast 7:1, sign language) beyond what the high-contrast presentation already gives.
- Accessibility of content users write (a user's own image without alt text in a note), beyond offering an alt text field where images are added.
- Third-party pages reached from the app (OAuth providers, calendars).
- Certification by an external body (VPAT/ACR can be generated from the statement later; owner question).

## Roadmap

Advances ROADMAP-1.0 milestone 1.0 "Trust", item `accessibility-aa`.

## Capabilities

### New Capabilities

- `accessibility`: the conformance statement, the blocking screen gate and its extra measures, dragging alternatives, accessible authentication, the recorded manual audit and its release gate, and the native shells' checks.

### Modified Capabilities

None. `design-system` keeps "Accessibility gate on stories" and "Focus visibility in the accessibility gate". `web-app` keeps "Interface audit tour" (it stays non-blocking for budget and overflow findings; the new capability makes its accessibility findings blocking through its own gate). `documentation` keeps "Accessible documentation".

## Impact

- **Data model, sync, op schema, E2EE, API/CLI/MCP:** none.
- **UI:** fixes found by the audit across screens (labels, roles, focus order, live regions, drag alternatives where missing). Each fix that changes visible behaviour beyond markup is listed in tasks and checked against the interface budget.
- **CI:** a new `a11y-screens` job on PRs touching `web/` (about 4 minutes, sharded in 2), and the nightly interface audit gains strict accessibility.
- **Bundle and binary size:** none expected. Fixes are markup and copy; budget checked by `bundle-budget`.
