# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The web app authenticates with the session cookie only.** Every request goes through `fetch(path, {credentials: 'same-origin'})` with no `Authorization` header (`web/src/lib/api.ts:71-77`), and the live channel is an `EventSource` (`web/src/lib/sync.ts:361-392`), which cannot carry a header at all. On the server `authenticateScoped` reads a bearer header or the cookie and nothing else (`internal/httpapi/server.go:395-417`); a `read` token is refused on `/api/v1/sync` whatever the method (`isWriteRequest`, `:419-428`), so a read token could never fill the device's local copy. Sessions last `OPENTODO_SESSION_DAYS` (90 by default, `internal/config/config.go:137`, `:163-168`) with a fixed expiry, not a sliding one (`internal/auth/mfa.go:218-227`).
- **Views are computed on the device.** Today and Upcoming filter the local tasks by `localDueOf(t.due).date` against `todayISO()` and group them (`web/src/app/TaskListView.tsx:116-131`, `:219-236`); saved views run through `runView` (`web/src/lib/views.ts:344`). Every list re-renders through `useLiveQuery`, and `startSync` plus `connectLive` already wake the device on remote changes (`web/src/lib/sync.ts:412-446`).
- **Shell shortcuts are global** (`web/src/app/Shell.tsx:100-150`): `g` sequences, `?`, Shift+I. The shell is what `App.tsx` renders once the account is ready (`web/src/app/App.tsx:220-236`).
- **Tokens** carry light and dark values under `:root`, `[data-theme="light"]` and `[data-theme="dark"]` (`web/src/index.css:29-33`, `:100-117`); type sizes are 11–24 px (`:85-90`); motion uses `--ease-calm` and `duration-(--duration-ui)`; reduced motion is handled by a media query. The in-flight `theming` change adds `data-accent` and an explicit mode on the same root and leaves "High contrast" palettes out of its scope.
- **Start view** is a per-device `meta` value: a built-in name or `view:<id>` (`web/src/lib/views.ts:413-437`), chosen in Settings → Preferences → Start view.
- **Invite and reset screens** render before the auth gate and keep sync off (`App.tsx:102`, `:160-190`); the display is the opposite: it needs the session and sync running, but not the shell.

## Goals / Non-Goals

**Goals:**
- A display is a different rendering of data the app already holds: no new data path, no server change, and the same convergence as the list.
- Every presentation choice is in the URL, so a kiosk bookmark or start view reproduces it exactly.
- Readable at 3 metres in daylight and on e-ink: high contrast, big type, nothing that animates.

**Non-Goals:**
- A read-only session or token sign-in for the web app (D1).
- Making the browser itself a kiosk: full screen, wake lock and hiding the address bar are the device's job and are documented, not built. A `navigator.wakeLock` request is a one-liner and is included, but its absence changes nothing.

## Decisions

### D1. Authentication: the ordinary session, with a viewer account for shared screens

The display route runs inside the signed-in app. Options considered for "optionally signed in with a read-only token":

- **A read token in a query parameter (`?token=ot_…`).** Rejected. The secret would sit in browser history, bookmarks, screenshots and proxy logs; the server would need to accept tokens from the query string on `/api/v1/sync/events` and, more seriously, `read` tokens are refused on `/api/v1/sync` by design (`server.go:419-428`), so the display would need a second data path over the REST collections instead of the local copy, losing offline use and the live channel's cheapness.
- **A read-only session kind.** Rejected for now. It would introduce a session scope into `requireAuth` and a pull-only mode into the sync handler, a change to the security model (`account-access`) out of proportion with a presentation feature.
- **Session plus project roles (chosen).** A full session on the person's own account shows their Today and may toggle. For a shared screen, the household creates a member account ("Fridge") and shares the project with it as a viewer: the server refuses every write from that account (`CanWrite`, `internal/sync/scope.go:109-121`), which is a stronger guarantee than a client-side flag. The docs say so, and say that the device must sign in again after `OPENTODO_SESSION_DAYS`.

What a full session on a wall tablet exposes is the whole app one URL away; the display hides the chrome but is not a lock. The docs recommend the device's kiosk or guided-access mode for that, and the viewer account for anything shared.

### D2. Routes and options

`router.ts` gains `{view: 'display', target: {kind: 'today'|'upcoming'} | {kind: 'project', id} | {kind: 'view', id}, options: DisplayOptions}` parsed from `/display[/today|/upcoming|/project/<id>|/view/<id>]` and the query string. `DisplayOptions` is `{size: 'm'|'l'|'xl', contrast: 'normal'|'high', motion: 'normal'|'none', seconds: boolean, days: 1..7}` with `eink=1` expanding to high contrast, no motion and no seconds before the explicit parameters are read, so `eink=1&contrast=normal` is possible. Unknown values fall back to defaults. `routePath` serialises the options back, so start view and "Display mode" entries round-trip.

- **Alternative: a Settings panel for display options.** Rejected: the options are per screen, not per person, and a bookmark is the natural place for a kiosk.

### D3. Rendering: `DisplayScreen` replaces the shell, sync keeps running

`App.tsx` renders `<DisplayScreen>` instead of `<Shell>` when `route.view === 'display'` and the phase is ready (after the unlock screen for encrypted accounts, since the display reads decrypted rows from Dexie like any view). `startSync` is not gated on the route, so the live channel and polling behave as in the shell; `ReauthHost` and the toasts stay mounted above both (reminder toasts are useful on a fridge).

The lists come from a new `web/src/lib/dayLists.ts` that extracts the Today, Upcoming and project filters and the Today grouping from `TaskListView.tsx:116-131` and `:219-236` into pure functions used by both screens, so the display can never disagree with the list. Columns for the next days call the same grouping per date. Saved views call `runView`. `useLiveQuery` on tasks, projects, sections and views drives re-rendering; a `setInterval` of one second (one minute without seconds) updates the clock, and when `todayISO()` changes the lists recompute.

Rows reuse the task checkbox class and the priority and due chips but not `TaskRow`, which carries drag handles, menus and hover controls the display must not show. Member names and breadcrumbs follow the list's rules (parent title next to a subtask in Today).

### D4. Presentation: a type scale factor and two root attributes

- **Size:** the display sets `--display-scale` (1.35, 1.6, 2.1 for m, l, xl) on its own root element and derives its font sizes from the type tokens multiplied by it (`calc(var(--text-body) * var(--display-scale))`), so the scale respects the browser's font-size setting as the design system requires. Body text lands at about 20, 24 and 32 px.
- **High contrast:** a `[data-contrast="high"]` block in `index.css` redefines the `--ot-*` tokens: canvas and surface `#ffffff`, text `#000000`, border `#000000` at 1.5 px, soft tints become the surface with a 2 px outline, priority hues darkened to reach 7:1 as text and 3:1 as marks, focus ring 3 px; and the dark variant (`[data-theme="dark"][data-contrast="high"]` and the system-dark branch) with `#000000` and `#ffffff`. The override pairs go into `web/src/ui/tokens/pairs.ts` under a new override key so `contrast.test.ts` measures them (threshold 7:1 for text in the override).
- **Motion:** `[data-motion="none"]` sets `--duration-ui` and `--duration-emphasis` to `0ms` and adds the same rules the reduced-motion media query applies.

`DisplayScreen` sets both attributes on `document.documentElement` on mount and removes them on unmount, so they never persist and never touch the user's preferences. They are separate attributes from `theming`'s `data-theme` and `data-accent`; the override block is written to win over any accent block by specificity (attribute plus `:root`), and `theming` can later expose the same block as a "High contrast" choice without rework.

- **Alternative: a full high-contrast theme in `theming`.** Deferred by that change itself; this override is the minimum for e-ink and is designed to be promoted.

### D5. Toggling and keyboard

`DisplayScreen` keeps its own roving focus across rows (`tabindex` 0 on the focused row, -1 elsewhere) with arrows, `j`/`k`, Home and End, and `aria-label`s that read the title, due and state. Space or Enter calls `setTaskCompleted`/`completeTask` from `lib/ops.ts` (`:682`, `:709`), which handles recurrence and subtasks exactly as the list does. A row is interactive only when `canEditTask(task, memberships, userId)`: personal data, or a shared project where the cached role is editor, admin or owner, the same rule the list uses for its read-only notice. The shell's key handler is not mounted (the shell is not rendered), so `g` sequences cannot fire; Escape navigates to the normal route of the same target. Touch: the checkbox is 44×44 px and rows are at least 56 px tall at size `l`.

### D6. Entry points and start view

Menu entries "Display mode" in the Today and Upcoming header area (next to the duration filters, `TaskListView.tsx:757-760`), in `ProjectHeader`'s menu and in a saved view's menu navigate to the display route with default options. The Exit control (bottom corner, faint, 44 px) and a "Make this the start view on this device" entry in a small overflow menu beside it cover leaving and pinning. `StartView` gains `display:<serialised route>`; `resolveStartView` validates the project or view id and falls back to the Inbox with the existing notice. The Settings → Preferences → Start view select lists "Display: Today" and "Display: Upcoming"; projects and saved views are pinned from the display itself to keep the select short.

### D7. Public link display (depends on `public-links`)

`PublicListScreen` reads the same `DisplayOptions` parser when `display=1` is present and renders through the same `DisplayColumn` and type scale, adding the clock. Its data path stays the public read route with polling; the clock and options are purely presentational. If `public-links` has not landed, this task group is skipped and its requirement archived with that change.

## Risks / Trade-offs

- **[A full session on a shared tablet]** → Documented plainly; the viewer-account set-up is the recommended path for shared screens and is server-enforced. The display itself never widens what the session can do.
- **[Session expiry after 90 days on a device nobody touches]** → The sign-in screen appears in place; the docs name `OPENTODO_SESSION_DAYS` for operators who want longer sessions on a trusted home network.
- **[Old e-ink browsers]** → The display needs the same browser the app needs (ES2020, `EventSource`, IndexedDB); Android e-ink tablets run Chromium and work, the Kindle browser does not. The docs say which.
- **[E-ink ghosting from the clock]** → With `eink=1` the clock updates once a minute and nothing else moves; the next-day columns change only when data changes.
- **[Drift between list and display logic]** → Both call the pure functions in `lib/dayLists.ts`, pinned by the same unit tests.
- **[High-contrast override breaks a component's look]** → Only the display route sets the attribute; the contrast test covers the override pairs, and the layout check opens the display at the three widths.
- **[Wake lock not supported]** → `navigator.wakeLock` is requested when available and ignored otherwise; the device's own setting is documented.

**Size:** no dependency. About 450 lines of TSX, 120 lines of CSS, 4 kB gzipped in the web bundle; the Go binary grows only by the embedded assets. No server or memory change.

## Migration Plan

No data changes. The start view's new `display:` values are additive: a client without this change treats an unknown start view as the Inbox through the existing fallback. Rollback is shipping the previous binary; a bookmarked `/display` then opens the Inbox.
