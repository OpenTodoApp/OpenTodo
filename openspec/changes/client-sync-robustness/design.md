# Design

## Sync sessions (DATA-3)

`db.ts` keeps a local data epoch, bumped by `clearLocalData` and by `stopSync`. `runOnce` captures it and calls `alive()` after every await that precedes a write; a changed epoch throws an internal `SessionEnded`, which ends the exchange silently (no status is published for a session that is gone). `stopSync` also aborts the session's `AbortController`, whose signal `api.sync` passes to fetch. `stopSyncAndWait()` stops and awaits the running exchange; `clearDeviceData` calls it before clearing. `getDeviceId` memoises per epoch, so the id is read (or created) again in the cleared database.

## Deadlines (DATA-9)

`lib/http.ts` wraps fetch with `AbortSignal.timeout` (combined with the caller's signal through `AbortSignal.any`, or a small fallback). A timeout becomes `RequestTimeoutError`, fetch's own `TypeError` becomes `NetworkError` (a `TypeError` subclass, so existing checks still hold); the caller's abort passes through. Defaults: 30 s per request, 10 min for import uploads, archive downloads, attachment downloads and the XHR uploads (`xhr.timeout`). A body that stalls after the headers also times out. The sync loop treats only these two (or `navigator.onLine === false`) as offline and schedules a retry with the live channel's jittered backoff (1 s doubling to 30 s), reset after a successful exchange or `online`.

## Upgrades (DATA-10, UI-9, INT-16)

`appUpdate.ts` listens for `vite:preloadError` (reload, at most once per 10 s via `sessionStorage`; a second failure shows the banner and lets the error reach the boundary), `controllerchange` after an existing controller (banner) and the Dexie `versionchange` (db.ts closes the connection; banner, this tab can no longer save). The banner sits above every screen. `PanelBoundary` wraps the shell's main view (reset on navigation), the panel slot and the lazily loaded overlays (help, assistant, palette, Vim) and the display screen; the root boundary stays the last resort. `internal/web` answers 404 for `assets` and anything under it that is not a file, and for any other path with an extension, so an old chunk request fails as a script error instead of receiving HTML.

## Actions (DATA-11, UI-16)

`app/actionError.ts`: `act(promise)` catches and shows the error's message (already translated: `ApiError` by code, local refusals with `t()`) in the existing toast; `void` stays only for intentionally fire-and-forget calls (notification reads, sweeps, prefetches). The keyboard edit queues of Calendar, Month and Timeline report instead of swallowing. `unhandledrejection` is logged to the console.

## One tab syncs (DATA-12)

`navigator.locks.request('opentodo-sync')` elects the leader; the lock callback's promise resolves on `stopSync` after the running exchange stopped. Followers do not arm the timer or open the event stream; `requestSync` posts `{type:'sync'}`, `syncNow` posts `{type:'sync', id}` and resolves on `{type:'done', id}` (or after 15 s); the leader broadcasts its status snapshot on every change. `announceSignOut` posts `{type:'signout'}`; other tabs reload. The clear runs inside `withSyncLock`, after this tab's own pending lock request was aborted by `stopSync`. Without `navigator.locks` or `BroadcastChannel`, every tab leads (the previous behaviour).

## Other fixes

- DATA-15: App derives `syncWanted` and the effect depends on it alone; `startSync` stores remover functions that `stopSync` calls.
- DATA-21: `holdOps` and `requeueHeld` read the held list inside their transaction (nested in the sync transaction where they run inside it).
- UI-18: the title effect keeps the draft while the input has focus and differs from the title it started from; blur commits as before.

## Data model, size, interface budget

No new fields or ops. No dependency. The main bundle grows by a few kilobytes of code; no server image or memory change. Screens: one banner row appears only after an upgrade (replacing nothing), the boundary message replaces a failed screen; no new shortcut, sidebar destination, scroll region or task property.
