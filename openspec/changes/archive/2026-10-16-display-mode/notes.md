# Implementation notes

## Status (2026-10-16)

Done on `feat/display-mode`: every task group. `public-links` had already landed, so group 5 (the public link display) was implemented rather than deferred.

## Decisions taken while implementing

- **Keys through the shortcut registry.** The display's keys are registry entries in a `display` view scope (`display.down`, `display.up`, `display.first`, `display.last`, `display.toggle`, `display.exit`; section "Display mode"), not a listener of their own: `listeners.test.ts` allows one window `keydown` listener (the dispatcher), and the keyboard guide and cheat sheet read the registry. Registering the scope installs the dispatcher, so it works without the shell. `vim.leave-field` lists `display.exit` in its overrides only to satisfy the static conflict check; the Vim layer is never mounted on a display.
- **Arrows.** ↓ and → move to the next row, ↑ and ← to the previous one, across groups and columns in reading order (the spec's "between rows across columns").
- **`xl` scale.** 2.15 instead of design D4's 2.1, so body text is 32.25 px and meets the spec's "at least 32 px" (2.1 gives 31.5 px).
- **Start view values.** `display:<path with query>`, e.g. `display:/display/today?eink=1`. `resolveStartView` returns `{kind: 'display', path}` and the shell navigates to `parseRoute(path)`; a missing or deleted project or view, or a malformed path, falls back to the Inbox with the existing notice. The router now tracks the query string on `/display` addresses only (`addressOf`), so options survive a cold load without changing how other routes compare addresses.
- **Escape.** Handled by `display.exit` in the registry; the scope is paused while a menu or dialog is open, so Escape closes the overflow menu first.
- **Notifications and toasts.** The spec lists no notifications on a display, so the reminder toasts (mounted by the shell) are not shown there, unlike design D3's note; `ReauthHost` stays above both.
- **Layout.** At 1024 px and wider, Today puts the day's list on the left and the day columns beside it (`.display-board[data-split]`), so a landscape tablet shows both without scrolling; columns use one type step smaller when side by side. Below 768 px everything stacks.
- **Priority marks** are a flag icon in the priority colour (a mark, 3:1), not "P1" text, because the normal-contrast p2 orange does not reach 4.5:1 as text. In high contrast the priority hues reach 7:1, and `OVERRIDE_PAIRS` measures them as text too.
- **Dashboards** cannot be shown as a display; `/display/view/<dashboard>` says so, and the view menu offers "Display mode" for list views only.
- **Lazy chunk.** `DisplayScreen` is its own chunk (about 6.7 kB, 2.5 kB gzipped). The public page imports only the light pieces (`Clock`, `DisplayColumn`, `displayOptions`, `displayHooks`). One icon was added to the vendored set (`monitor`, through `scripts/icons-sync.mjs` from lucide-static 1.48.0).
- **Docs.** The guide pages `views.md`, `install-app.md`, `sharing.md` and `settings.md` were within a few words of the 600-word limit for guide pages, so the full set-up (viewer account, kiosk mode, `OPENTODO_SESSION_DAYS`, browsers) lives in a new guide page `docs/display-mode.md`, with short sections in `views.md` ("Display mode") and `install-app.md` ("On a tablet or an e-ink display") linking to it. The start view option is documented in `settings-app.md` (where Settings → General is described) rather than `settings.md`, which only links there. The public link display has its own section in `public-links.md`, and `sharing.md` links to it. The screenshot `docs/images/display-today-{light,dark}.webp` comes from a new `display-today` shot in `scripts/docs-screenshots.mjs`.
- **Workbench.** The Foundations story "High Contrast Override" sets both root attributes while shown; it is tagged `no-visual` (a11y-checked, no screenshot baseline), because baselines are regenerated in the pinned Playwright image.

## Verification substitutes (no physical tablet or e-ink panel here)

- **Layout check (3.4, 5.1).** `scripts/e2e-layout.mjs` gained `display-today`, `display-today-high-xl`, `display-upcoming` (eink), `display-project` (xl), `display-view` (high contrast) and `public-display` (eink). Ran against a fresh server with Chromium only (WebKit is not installed in this environment): 360, 390 and 768 px, light and dark, `LAYOUT OK` (no sideways scroll, 44 px targets, no serious axe issue).
- **Workbench (2.2).** `make ui-check` needs the Storybook build and the pinned Playwright image for visual baselines; `make ui-lint` (stories for every component, no glyph icons) was run, and the story's tokens are covered by `contrast.test.ts`.

## Smoke test (2026-10-16, task 6.1)

Ran `./bin/opentodo` on a fresh data directory with headless Chromium (Playwright, browsers from `/opt/pw-browsers`) as the tablet, at 1024 × 768 with touch, in place of a physical tablet and e-ink panel:

- `/display/today?eink=1`: `data-contrast="high"` and `data-motion="none"` on the root, a pure white canvas, clock `11:20 AM` without seconds, body text 24 px, no sidebar or quick add.
- A second browser context (the "laptop", same account) completed "Take out the bins"; the display showed it under **Done today** about 50 ms after the server accepted the change (live channel).
- Home then Space on the display completed "Water the plants".
- "Make this the start view on this device" from the overflow menu, then opening `/`: the app went straight to `/display/today?eink=1`.
- Escape returned to `/today` and the root attributes were gone.
- A "Fridge" account, a viewer of the shared "Household" project: `/display/project/<id>` showed the rows with no checkboxes; `j` then Space changed nothing on the server.
