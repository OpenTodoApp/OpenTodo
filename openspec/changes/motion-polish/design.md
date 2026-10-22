# Design

## Context

See proposal.md for why. The audit already had M15 (a snapshot of running animations that move, taken 60 ms after three actions) and M12 (the sum of layout-shift entries without recent input, reported as "page"). Data on most screens comes from Dexie live queries that start `undefined` and are usually defaulted to an empty array, so the first frame renders "no data" and the next frame renders the data; settings cards fetch from the server on mount. The probe used here (Playwright, layout-shift sources, 360 and 768 px) showed the shifts came from the data arriving, not from animations.

## Goals / Non-Goals

**Goals:** measure motion where it can still hide (every overlay, drags, phone sheets); remove every layout shift the audit reports, at its cause; keep every fix offline-safe and per device.

**Non-Goals:** new animations; changing how much data a screen loads; the other rules' findings (`ux-fixes-phone`).

## Decisions

### D1. The phone bar keeps one height

The bar's title column is 44 px tall (`h-11`), centred, holding the title (24 px line) and one subtitle line (`.phone-subtitle`, 18 px, one line, cut at the edge). The subtitle's controls keep a 44 px touch area through a transparent absolutely positioned `::after` (−13 px above and below) instead of `min-height: 44px`, which grew the line. Alternatives: reserving the subtitle's line only on pages that have one (the page cannot know before its data arrives), or letting the bar grow but animating it (motion the person did not ask for). M7 learns to count such an `::after` as the control's hit area, so the audit does not report a 18 px target that is really 44 px.

### D2. A screen draws what depends on local data once it is read

Each screen that reads local data now distinguishes "not read yet" from "empty": `useListModel` exposes `loading` (the shared task snapshot is `undefined`) and `projectsLoaded`; PlanView, StatsView, ProjectsView and FeedView do the same with their own hooks (`useAllTaskRowsOrLoading`, `useProjectsLoaded`, `useTasksByIdRead`, which also says whether its rows answer the current ids). Until then they show the existing `Skeleton` (task-list-presentation "Skeleton loading"), and the empty state, the groups, "Add section", "Close the day" and the Updates "Load older" button are not drawn. A project page waits for its project row, so the generic header never shows before the project header. The sidebar draws Favourites, Projects, Labels and Filters once projects, labels, views and preferences are read (`useSidebarRowsLoaded`) and the collapse state was read for the current project list (the live query returns which list it answered for). The Display screen draws its footer with the content; the invite screen shows its "Checking…" card only after 400 ms; Updates gives its filter selects a fixed width; the Data page puts the sync badge on its own line. Alternative: hiding the whole app until every store is read (a later first paint everywhere for screens that need one store).

### D3. Settings sections settle before they show

`SettingsPendingGate` wraps a section's cards; a card that asks the server calls `useSettingsPending(waiting)`. The gate's cards are `visibility: hidden` (they keep their place, are not painted, and so cannot shift) until no card reports waiting, at most `SETTLE_MS` = 600 ms; afterwards the gate never hides again, so a reload after a change shows the card's own state. Children report in layout effects, which run before the gate's, so a section with nothing to wait for is visible in its first frame. Alternatives: per-card placeholders sized like the loaded card (heights differ by data, device and language) or loading cards in sequence (slower).

### D4. M15 watches a moment, not a snapshot

`watchMotion()` starts before the action: a capture-phase `transitionrun` listener records transitions on moving properties, and a per-frame poll of `document.getAnimations()` records running animations whose keyframes move (Web Animations, CSS animations, view transitions); `motionSeen()` stops and returns them. The tour runs it under `reducedMotion: 'reduce'` for every overlay of the inventory with an opener (at 1280 px with a mouse and at 360 px as a touch device, skipping overlays whose screen is not at that width), completing a task in Today (a different task at each width, since the account is shared), and three drags at 1280 px: a card to the next board column, a Plan task to the next day, a Week block down an hour. A run with motion allowed finds the panel, sheets, toasts, drags and the drawer moving, which shows the watch works; under reduced motion it finds nothing. Strict mode now includes M15.

### Defaults chosen

- Rows that arrive by sync (motion-v2's open question) keep appearing at once: a fade would be motion on someone else's change, and the list reflow already handles the user's own.
- M12 is not in strict mode yet: it depends on timing, and a loaded CI runner can delay a query past a frame.

### Data model, size and interface budget

No data model change: no op field, table or stored preference. No dependency; the image and runtime memory are unchanged and the web bundle grows by a few hundred bytes. The interface budget is unchanged: no chrome row, task property, sidebar destination, scroll region or shortcut is added; the phone bar keeps its single row (now of fixed height), and the skeleton takes the place of content that was there anyway. Offline nothing changes: every gate waits for local reads, and the settings gate gives up after 600 ms, offline included.

## Risks / Trade-offs

- [A slow device shows the skeleton longer than an empty page used to] → the skeleton is the specified cold-start look; data arrives in the same time.
- [A settings section can be invisible for up to 600 ms on a slow server] → `aria-busy` is set meanwhile; the heading stays visible; after 600 ms every card shows its own loading state as before.
- [The subtitle is cut on a narrow phone] → it was one truncated line before for text; controls in it (members, Public) stay reachable from the project menu and the share dialog.
- [A component that reads "loading" wrongly as "empty" elsewhere] → the new hooks are additive; existing hooks keep their defaults.

## Migration Plan

Presentation only: nothing stored changes, no server change. Rollback is a revert.
