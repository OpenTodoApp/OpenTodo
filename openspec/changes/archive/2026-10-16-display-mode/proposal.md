# Proposal

## Why

A household that runs OpenTodo wants the day's list on the fridge: a tablet or an e-ink panel that shows what is due, readable from across the kitchen, without a sidebar, menus or a cursor. Today the only way is the full app at phone size: 15 px body text (`web/src/index.css:85-90`), a header full of controls, and animations that smear on e-ink. The data, the live refresh and the keyboard model already exist; what is missing is a presentation.

## What Changes

- **Display routes.** `/display/today` (the default for `/display`), `/display/upcoming`, `/display/project/<id>` and `/display/view/<id>` render one view without the shell: no sidebar, header controls, quick add or detail panel. Today shows a clock and the date, overdue and today's tasks, the tasks completed today ticked below them, and the next days (`days=1..7`, default 3) as columns that stack on narrow screens. Upcoming shows the next days (default 7). A project shows its open tasks by section; a saved view shows its result with its own grouping.
- **Big type, high contrast, no motion.** Presentation is chosen in the URL so a kiosk bookmark carries it: `size=m|l|xl` (default `l`, body text at least 24 px), `contrast=high` (black on white or white on black surfaces, no soft tints, 3:1 borders), `motion=none`, and `eink=1` as a preset for high contrast, no motion and a clock without seconds. High contrast is a token override on the document root, applied only while a display route is shown, so it does not collide with the `theming` change's mode and accent attributes.
- **Live and offline.** The display reads the device's local copy and re-renders on every change, so it follows other devices within seconds over the existing live channel and keeps working offline, with a small line saying when it last synced. The clock and the date roll over by themselves, including at midnight.
- **Signed in with a session; toggling by rights.** A display route needs the app's ordinary session. A task can be toggled from the keyboard (Space or Enter on the focused row) or by touch (its checkbox) only when the signed-in account may edit it: a viewer of a shared project sees no checkboxes. For a shared screen the recommended set-up is a dedicated account that is a viewer of the household project, which the server enforces; the roadmap's "read-only token" idea is refined this way because the web app cannot sign in with a bearer token (see design D1).
- **Entry and exit.** "Display mode" in the Today and Upcoming headers, in a project's header menu and in a saved view's menu opens the display; Escape or the small Exit control returns to the normal view. The per-device start view can be a display route, so a tablet reopens straight into it after a restart.
- **Public links on a display.** With `public-links` in place, a public page accepts the same presentation parameters (`/public/<secret>?display=1&eink=1`), so an e-ink panel can show a shared list with no session on the device at all.

Out of scope:
- A kiosk lock, screen dimming, or hiding the browser's address bar: those belong to the device's kiosk or full-screen mode (documented, not built).
- A read-only session kind or token sign-in for the web app (design D1 explains why not now).
- New data, views or filters; the display shows what the existing views show.
- Translations and a settings panel for display options; options live in the URL.

ROADMAP: advances "Next: Parity and depth" row 14, **Display mode** (`display-mode`). Refinements of the row's notes: "optionally signed in with a read-only token" becomes "signed in with a session; for shared screens, a dedicated viewer account", and the display also serves public links.

Depends on: `public-links` only for the last requirement (public link display); everything else stands alone and that requirement can be archived with `public-links` if it lands later.

Nothing here is **BREAKING**: no server change, no route, no environment variable, no op field, no dependency.

## Capabilities

### New Capabilities
- `display-mode`: the chrome-free, large-type display routes: what each shows, the clock, presentation options, live refresh and offline behaviour, toggling rights and keyboard and touch operation, entry and exit, and the public link display.

### Modified Capabilities
- `custom-views`: "Start view per device" accepts a display route, so a device can open in display mode.
- `design-system`: new requirement: a high-contrast token override and a no-motion attribute, with contrast checks for the override pairs, applied by routes that ask for them and orthogonal to theme mode and accent.

## Impact

- **Web only:** `web/src/app/router.ts` (display routes and query options), `App.tsx` and `Shell.tsx` (render `DisplayScreen` instead of the shell on display routes while sync keeps running), a new `web/src/app/display/` folder (`DisplayScreen`, `Clock`, `DisplayColumn`, `displayOptions.ts`), reuse of the Today, Upcoming and project filters from `TaskListView.tsx:116-131` through a shared `lib/dayLists.ts`, `lib/views.ts` start view values (`web/src/lib/views.ts:413-437`), menu entries in `TaskListView.tsx` and `ProjectHeader.tsx`, `index.css` `[data-contrast="high"]` and `[data-motion="none"]` blocks, `web/src/ui/tokens/pairs.ts` entries for the override.
- **Server:** none. The display uses the session cookie, `/api/v1/sync` and `/api/v1/sync/events` as the app does.
- **Docs:** `docs/views.md` (new section, `display-mode` in `specs:`), `docs/install-app.md` ("On a tablet or an e-ink display"), `docs/settings.md` (start view), `docs/keyboard.md` (regenerated), `docs/sharing.md` one line for the public display, CHANGELOG.
- **Size:** no dependency. About 450 lines of TSX and 120 lines of CSS; about 4 kB gzipped in the main bundle (the screen is lazy-loaded like the settings panels if the build already splits them, otherwise inline). No server or memory change.
