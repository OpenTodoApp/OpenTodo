# Design

## Context

- **The page scroller.** On every width the page scrolls in one element, `#content` in `Shell.tsx` (`overflow-y-auto`, the ref `content`). The tab bar's hide-on-scroll (`usePhoneChrome`), page focus and the skip link already use it. Lists, Today, Settings, a task page and the Month scroll there. Day and Week put their own scroller inside it (`CalendarView`), a board scrolls its columns, and sheets and dialogs are portalled outside `<main>`.
- **Gestures today.** Row swipes (`rowSwipe.ts`) and the edge swipe (`edgeSwipe.ts`, loaded lazily from `Shell`) use pointer events with a 12 px sideways lock and give up at 8 px of vertical travel. The long-press drag (`lib/dnd.ts`) prevents `touchmove` once it has lifted a row.
- **Sync.** `syncNow()` in `lib/sync.ts` resolves when the exchange ends and never rejects; `syncSnapshot()` then says how it went. Offline it publishes `offline` and sends nothing. `SyncStatus.tsx` holds the wording.
- **iOS.** `ShellController` puts a `UIRefreshControl` on the web view's scroll view; its action is `webView.reload()`. Android has no pull to refresh.
- `shell-touch` (another change) sets `overscroll-behavior` on the page root. This change does not rely on the browser's overscroll in either direction.

## Goals / Non-Goals

**Goals:** a pull that syncs, on every touch device, that never fights another gesture and never reloads; the iOS reload gone when the web app can sync, kept when it cannot.

**Non-Goals:** pull to refresh inside inner scrollers; a setting to turn it off; changing overscroll; Android shell code.

## Decisions

### D1. Touch events, listened to only while an eligible touch is down

The gesture uses `touchstart`/`touchmove`/`touchend`, not pointer events. A browser that starts panning sends `pointercancel` and stops delivering pointer moves, also when the scroller is at its top and nothing moves, so a pull could not be followed. Touch events keep coming, and `preventDefault()` on the move keeps the page still under the mark and stops a browser's own pull to reload. A mouse, a trackpad and a wheel send no touch events, so they cannot start it.

`#content` gets one passive `touchstart` listener. Only when the touch is eligible are the non-passive `touchmove`, `touchend` and `touchcancel` listeners added to the window, and they go when the touch ends. A list that is not at its top scrolls with no code of this change in its path.

Alternative: `touch-action: pan-x pan-up` on the scroller at its top, with pointer events. Rejected: Safari does not support `pan-up`, and toggling `touch-action` on scroll is one more thing to get wrong.

### D2. What makes a pull (`web/src/app/pullToSync.ts`, pure functions)

- `pullStarts`: one finger; `scrollTop <= 0`; not in the 20 px edge strip (`SWIPE.edge`); no pulled sync running; no `[aria-modal="true"]` open; no text selected; and nothing under the finger owns the touch.
- `ownsTouch` walks from the touched element up to the scroller: a scroller with something to scroll (the calendar grid, a lane region), an element with `touch-action: none` (span handles, resize edges), the focused text field, or a dialog. This is one general rule instead of a list of screens.
- `pullLockOf(dx, dy)`: sideways travel of 12 px (`SWIPE.lockX`) leaves the touch to the rows and the edge; from 12 px down the touch is a pull if it went at least twice as far down as sideways, else it is left alone. Up is never a pull.
- While following: a second finger, a scroller that moved, or a `touchmove` already prevented (a lifted drag) ends the pull without a sync.
- `pullOffset`: the mark travels half the finger's travel, at most 96 px. `pullFires`: released from 64 px of mark travel (the row swipes' reveal distance), the pull syncs.

### D3. The mark and the result (`web/src/app/PullToSync.tsx`)

A 32 px round surface with the `loader-circle` icon, centred over the top of the page, in a zero-height host between the phone bar and `#content` (clipped above the page, `pointer-events: none`). It is moved by writing `transform` to the element on each move, not through React state. It turns with the pull, takes the accent colour once a release would sync, and gives the haptic tick there (`motion.ts` `tick()`, under the existing haptics preference). On release it rests 16 px under the page's top and spins until `syncNow()` settles, then returns. A `role="status"` element says "Syncing…" while it runs.

Reduced motion (`prefersReducedMotion()` or the no-motion display mode): the mark appears at its resting place and does not follow or turn; the spin already stops under `motion-reduce`. Durations and easing are the tokens.

After the sync, `pullNotice(syncSnapshot())` picks what to say: "Offline", "Signed out", "Locked" (the strings `SyncStatus` already has) or the status's error sentence; it is shown with `showActionToast`, like a tap on the compact sync status. A sync that worked says nothing.

No new string, so no translation work.

### D4. The bridge: `pull-refresh` and `pullHandled()`

The shell cannot know by itself whether the page it loaded can handle the pull: the web app comes from the user's server and may be older than the shell. So the page says it.

- Capability `pull-refresh`: "this shell has its own pull to refresh". iOS lists it in the visible app; Android and the iOS background run do not.
- Method `pullHandled()`, no arguments, no answer: "the page showing handles the pull itself". The web app calls it (`takeOverPull()` in `lib/shell.ts`) when the gesture is installed, so once per page load.
- iOS: `PullRefresh` (in `Bridge.swift`) holds one flag. `BridgeHost` posts a notification, as `setSystemBars` does; `ShellController` takes the refresh control off the scroll view. On `didCommit` (another document: a reload, a sign-in page, an older web app after a server change) the flag is cleared and the control is back. Route changes inside the web app are same-document and do not commit, so the control stays off while the app runs.

Every combination degrades to a working refresh: old shell and new web app (not called; the reload stays until the app updates, and the web gesture is prevented from doubling only by `shell-touch`'s overscroll rule, see Risks), new shell and old web app (never called; reload as today), new and new (sync, no reload).

Alternatives: a bridge version bump (rejected: nothing changed shape); the shell probing the page with injected JavaScript (rejected: the bridge is the one contract, and it has fixtures); removing the native control outright (rejected: an older web app would lose its only refresh).

The call is pinned by a new shared fixture, `mobile/android/app/src/test/resources/bridge/pull.json`, produced by `shellBridge.fixture.test.ts` from the real call and read by the iOS unit tests.

### D5. Loaded only where a finger can pull

`Shell` renders `PullHost`, which renders the lazy `PullToSync` chunk only under `(pointer: coarse)`, the query the app already uses for touch. A failed chunk load leaves the gesture out instead of showing an error.

## Data model impact

None. No op, no field, no stored preference. The pull calls the existing sync; offline nothing is sent and the outbox stays as it is.

## Size impact

No dependency. Measured with `scripts/bundle-budget.mjs` on the built app: the entry chunk grows by 55 bytes gzip (149,286 to 149,341; 145.8 KB shown both times, budget 146 KB), and the first load is unchanged within noise (720,071 to 720,065 bytes; 703.2 KB, budget 704 KB). The gesture and mark are a separate chunk of 3.9 KB (2.0 KB gzip), fetched on touch devices only. Container image and runtime memory: no measurable change. The iOS app gains about 40 lines.

## Interface budget (docs/interface-guide.md)

No chrome row: the host has no height and the mark overlays the page only during a pull. No task property, no sidebar destination, no scroll region (the page scroller is the one it listens to), no shortcut: the keyboard and pointer way to sync now stays the sync status button.

## Risks / Trade-offs

- **Older iOS shell, new web app.** The shell does not know `pullHandled` and keeps its refresh control. Whether a pull then reaches the native control depends on the page's overscroll: with `shell-touch` (and already when this gesture prevents the touch move) the web view's scroll view is not dragged, so the web gesture wins. If both ever fired, the result would be a sync followed by a reload, which is today's behaviour plus a sync.
- **Swift is not compiled here.** CI's `ios` job is the first compiler for the Swift changes; they are small and follow the `setSystemBars` path.
- **A page whose content is one inner scroller** (Day, Week) only pulls from its header. Accepted: the grid's own vertical gestures matter more there.
- **Minimum display time.** A fast sync makes the mark leave quickly; no artificial delay is added.
