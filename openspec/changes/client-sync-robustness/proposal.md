# Proposal

## Why

An audit of the web client (DATA-3, DATA-9, DATA-10, DATA-11, DATA-12, DATA-15, DATA-21, UI-9, UI-16, UI-18, INT-16) found ways the app loses edits, writes data into the wrong account, or stops working until the user reloads by hand:

- Signing out while a sync exchange waited for the server let that exchange write the previous account's operations and cursor into the freshly cleared database; the memoised device id survived the sign-out.
- Requests had no timeout: one stalled request kept the sync loop "running" for good, and nothing synced again until a reload.
- After a server upgrade an open tab still ran the old release. Its lazily loaded chunks were gone, the server answered the missing files with the app page (status 200), the failure was shown as "offline" (every `TypeError` counted as offline) and the single root error boundary blanked the whole app.
- A newer tab upgrading the local database got no reaction from older tabs; storage was never marked persistent (Safari evicts it); about 90 user actions (`void updateTask(…)` and similar) dropped failures silently, and refused actions such as making a task its own subtask were swallowed with `.catch(() => undefined)` although a translated message existed.
- Every open tab ran its own sync loop on the same database and device id.
- Sync was restarted on every route change, and its window and document listeners were never removed.
- Held operations (server limits) were read outside the transaction that cleared them, so an op held meanwhile was lost or queued twice.
- A remote title change overwrote the title being typed in the task panel.

## What Changes

- Sync sessions: `stopSync` and `clearLocalData` start a new local data epoch; a running exchange checks it after every await and stops writing, its in-flight request is aborted, sign-out waits for it before clearing, and the device id is read again after a clear.
- Every request has a deadline (30 s, 10 min for uploads and downloads); a timeout or a network failure is offline and retried with backoff; other errors are errors.
- Recovery after an upgrade: a missing chunk reloads the tab (once; then a prompt), a new service worker or database version shows a "Reload to update" banner, screens and panels sit in their own error boundaries with a Reload action, and the server answers 404 for missing files under `assets/` and for any path with a file extension (extension-less paths still get the app page).
- Dexie `versionchange` closes the connection and shows the banner; `navigator.storage.persist()` is requested after sign-in; user actions go through a helper that shows the failure as a toast; unhandled rejections are logged.
- One tab syncs: the tab holding the Web Lock `opentodo-sync` runs the loop, the others ask it over a `BroadcastChannel` and mirror its status; without Web Locks every tab syncs as before. A sign-out in one tab reloads the others and the clear runs inside the lock.
- Sync starts and stops on one boolean (signed in on a syncing screen), and `stopSync` removes its listeners.
- Holding and requeueing held operations read and write inside one transaction.
- The task panel keeps a title draft while the field is focused and changed.

No op schema, API or data model change; no new environment variable. Not **BREAKING**.

**Out of scope**: clock skew handling and the HLC (another change); a shared HLC across tabs; the push service worker's timestamps (DATA-12 mentions it; separate follow-up). ROADMAP.md item advanced: none; this hardens existing behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `offline-first-sync`: sign-out stops the running exchange; request deadlines; what counts as offline; one tab syncs; held operations are kept atomically.
- `web-app`: render failure containment per screen and panel; recovery after a server upgrade; failed actions are shown; the title draft survives remote changes; storage persistence.

## Impact

- `web/src/lib/sync.ts`, `db.ts`, `ops.ts`, `api.ts`, new `http.ts` and `appUpdate.ts`, `limits.ts`, `attachments.ts`; `web/src/app/App.tsx`, `Shell.tsx`, new `PanelBoundary.tsx`, `UpdateBanner.tsx`, `actionError.ts`; the `void` action calls in `web/src/app`; `web/src/main.tsx`.
- `internal/web/web.go` (404 for missing files).
- Five new UI strings, translated in every shipped catalog.
