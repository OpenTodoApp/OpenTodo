# Proposal

## Why

The design tokens in `web/src/index.css` give every colour a light and a dark value, and the shared UI in `web/src/ui` uses nothing else (the token lint enforces it). The screens in `web/src/app` were exempted until their redesigns: they still carry about 810 raw Tailwind palette classes (`slate-*`, `emerald-*`, ...) in 58 files, a handful of hex literals, and the component classes in `index.css` (notes editor, help prose, task checkbox) add about 25 more. Any colour change made through the tokens stops at these screens. This is the prerequisite for `theming`: user-chosen accents and an explicit light/dark mode can only look coherent once every screen colours itself through tokens. It also lets the design language reach screens without waiting for a full redesign of each.

## What Changes

- **Screens colour through tokens.** Every raw palette class and hex literal in `web/src/app` and in the component classes of `web/src/index.css` is replaced by the semantic token that carries the same meaning (surface, text, border, accent, priority, status, palette hue). Hard-coded `white` and `black` surfaces and scrims are included. Light and dark keep their character. Where a raw shade differed slightly from its token (for example `slate-600` against the muted text token), the screen takes the token value, which already meets the contrast rules. This is not a redesign: layout, spacing and copy stay as they are.
- **Meaning decides the token.** Emerald used for actions, selection, links and focus becomes the accent. Emerald used for "done" or "success" becomes the success status. Red, amber and sky become danger, warning and info (or p1 where they mean priority). This split is what lets `theming` change the accent without turning completed tasks blue.
- **Stored colours go through the palette everywhere.** The calendar and the activity feed still draw stored project colours as raw hex. They now render through the nearest palette hue like the rest of the app, as the existing design-system requirement already demands.
- **The token lint covers screens.** The lint that today checks `web/src/ui` also checks `web/src/app` and the component layer of `index.css`, so `make check` names the file and line of any new raw colour. Stored data colours passed as `color=` stay allowed, as in `web/src/ui`.
- **Temporary exceptions, listed by name.** The label, view, section and project-header menus (see design.md for the exact list) are being rewritten by `labels-and-menus`. They stay on an explicit allow-list in the lint until that change lands, so the two efforts never edit the same lines. The allow-list can only shrink. The task detail files, already redesigned by `task-detail-redesign`, are migrated here like any other screen.
- **Missing tokens get added, not improvised.** Where a screen needs a meaning the tokens lack (for example a calendar grid line or an overlay scrim), a named token with light and dark values is added and covered by the contrast check, instead of keeping a raw class.

## Out of scope

- Theme selection, accents other than emerald, or a light/dark override. Those belong to `theming`, which depends on this change.
- Redesigning any screen, or touching the `labels-and-menus` files beyond the allow-list.
- The website (`website/`) and the generated docs site.

This change advances no new ROADMAP.md item on its own. It finishes the token adoption begun by `design-language` and `ui-primitives` and unblocks the theming idea.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: "Semantic design tokens" extends from new UI code and the shared UI folder to every screen and the component class layer, with the lint scenario covering `web/src/app` and its temporary allow-list. "Legacy component classes follow the tokens" no longer needs to describe unmigrated screens. A new requirement states that colour roles follow meaning (accent against success, status against priority).

## Impact

- **Code:** `web/src/app/**/*.tsx` (57 files, the largest being CalendarView, AuthScreen, Sidebar, ImportScreen and TaskRow), `web/src/index.css` component layer, possibly new tokens in `index.css` with entries in `web/src/ui/tokens/pairs.ts`.
- **Checks:** `web/src/ui/tokens/lint.test.ts` widens its scope. No new CI job. The 80 visual baselines of the settings stories in `web/src/app` may shift by small shade differences. They are regenerated once through the existing "UI baselines" workflow and reviewed side by side. Any change beyond a shade (layout, a missing border, a lost state colour) is a defect. Screens without stories are compared before and after with the existing seeded screenshot script, locally, not in CI.
- **Data, API, server:** none. No op schema change, no new route, no environment variable.
- **Size:** no new dependency. CSS output size is roughly unchanged (utilities swap one-for-one).
- **Coordination:** merges before `theming`. `labels-and-menus` removes its files from the allow-list as part of its own work.
