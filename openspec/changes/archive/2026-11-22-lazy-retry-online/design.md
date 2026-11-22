# Design: lazy-retry-online

## D1. One lazy

`lib/lazy.ts` exports `lazy(factory)` with React's signature. It keeps the React `lazy` component it renders in a variable; when the import rejects, the entry is remembered as failed. `retryFailedImports()` replaces each failed entry with a fresh React `lazy` over the same factory, so the next render imports again. Nothing is replaced at the moment of failure: React renders an errored tree once more before the boundary takes it, and a fresh import there would retry in a loop while offline.

The browser does not keep a failed dynamic import: a second `import()` of the same URL after the network returns loads it (checked in Chromium with Playwright), so no URL change is needed.

Five loaders keep a chunk in a module variable (`x ??= import(…)`) so a second render does not suspend (note-links D5). They kept a rejected promise too, which is what left the project's Linked references broken in the issue's trace; each now clears the variable when the import fails (`.then(ok, (err) => { x = null; throw err })`).

All 154 `lazy(` call sites import it from `lib/lazy` instead of `react`; an ESLint rule (`no-restricted-imports`, `react` `lazy`) keeps it so.

## D2. The boundary

`PanelBoundary` tells a failed chunk load from other errors by its message (Chromium "Failed to fetch dynamically imported module", Safari "Importing a module script failed", Firefox "error loading dynamically imported module"). When it catches one while `navigator.onLine` is false, it listens for `online`; on it, it calls `retryFailedImports()` and clears the error, so the part renders again. The first requests after `online` can still fail (seen in Chromium: `ERR_INTERNET_DISCONNECTED` right after the event), so a chunk failure caught during these retries is tried again 1, 2 and 4 s later, three more times at most, before the message stays. Online failures keep today's path: `appUpdate` reloads into a new release or shows the prompt, and the boundary keeps its Reload button.

## D3. Budget

A screen with the message shows no new chrome; the change adds no visible element. Bundle: a few hundred bytes in the entry chunk (the boundary and the helper are already on the first load).

## D4. Tests

vitest: the helper (a failed import throws until retried, then loads; no retry without being asked), a keeping loader (the template library loads on the call after a failed one), the boundary (offline chunk error recovers on `online`, also when the first try after it fails; an ordinary error keeps the message; an online chunk error keeps the message), the lint rule. A browser check (Chromium, the built app, no service worker): a second device opens a project offline, the panels show the message, and back online they render without a reload. The end-to-end offline step itself is covered by GitHub issue 1746's fix.
