# Design

## D1: ESLint for hooks only

Flat config `web/eslint.config.js`. Parser: `typescript-eslint` (needed to read TS/TSX; no type-aware rules, so no program is built and the lint takes about 13 s). Rules: `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` as errors; `linterOptions.reportUnusedDisableDirectives: 'error'` so a suppression that no longer suppresses anything fails. No formatting or style rules: tsc checks types, `scripts/ui-check.mjs` the design rules.

`eslint-plugin-react-hooks` 7 also ships React Compiler diagnostics in its recommended set (`refs`, `purity`, `set-state-in-effect`, `immutability`, …). They report about 150 sites that are correct React without the compiler (latest-value refs, effects that reset state on a key change). The app does not use the React Compiler, so they stay off; adopting the compiler would be its own change.

Plain `.ts` tests and `*.testkit.tsx` turn `rules-of-hooks` off: `useDatabase(name)` there opens a named Dexie database (`lib/db.ts`) and `use` is a local helper; neither is a React hook and no component is rendered. Stories that keep state name their render function (`function CollapsibleStory()`).

Findings: real fixes where the value was unstable (`StatsView` range, `ReviewView` task rows, `SavedViewView` groups were new arrays every render, so their memos never held); `setOpenId` is imported under that name instead of copied to a local; the rest are intentional and say why (`zone` and `lang` as invalidation keys of memos whose callbacks read module state, mount-only effects, effects keyed on content). The two disables for rules that do not exist here (`@typescript-eslint/no-explicit-any`, `react/no-danger`) became plain comments.

**Size**: development dependencies only (eslint 10.11.0, typescript-eslint 8.71.0, eslint-plugin-react-hooks 7.1.1; 80 packages in the lock file, about 35 MB in `node_modules`). Nothing reaches the bundle, the binary or the container image (the image builds the web app with `npm ci` and runs no lint; build time and memory are unchanged). Runtime memory: none.

## D2: Hermetic, load-tolerant tests

`src/test-setup.ts` sets `globalThis.fetch` (and `window.fetch` under happy-dom) to a stub that records the request and rejects; an `afterEach`/`afterAll` hook throws with the list, so the test that made the request fails even when the app swallows the rejection. A test's own `vi.stubGlobal('fetch', …)` or `vi.spyOn(globalThis, 'fetch')` takes precedence and `vi.unstubAllGlobals()` restores the stub. `mockFetch(answer)` in `ui/test-utils.tsx` answers JSON for the requests a test expects and lets every other one fall through to the stub; `noPublicLinks` answers the project header's public-links lookup.

`waitFor(ok, what, timeout = 10 s)` in `ui/test-utils.tsx` polls a (possibly async) condition with `flush(10)` and throws naming `what`; it measures `performance.now()`, so tests that fake `Date` still time out. Test-local copies counted iterations and some returned silently; the flaky files use the shared one. `testTimeout` is 30 s: the cap catches hangs, while conditions carry their own deadline. The palette's 500 ms performance budget takes the best of three runs.

## D3: One clock for the app and the service worker

`hlc.ts` exports `CLOCK_OFFSET_META = 'hlc_offset'`, `hlcOffset()` and `hlcSeedOffset()`. After `hlcObserveServerTime` in each sync round, `sync.ts` writes the offset when it differs from the stored one (one `meta` read per round, a write only on change). `getDeviceId()` seeds the offset next to the stored HLC, so edits made before the first sync answer are also corrected. The worker reads the row in the same transaction as `device` and `hlc` and stamps `max(Date.now() + offset, hlc + 1)`.

When the worker uploads by itself (no window open) it now reads the answer: ops the server refused stay in the outbox, and an answer that is not a sync response keeps all of them, as the app does (client-data-safety). The app's next sync sends them again and handles the refusal through its usual path (`restampSkewed`, refused-op handling).

**Offline and convergence**: offline, nothing changes: the ops are queued as before and carry the corrected stamp. Convergence improves: worker ops compete under the same clock as the app's edits, and a refusal can no longer leave the local store and the server disagreeing.

**Data model**: one device-local `meta` row; no op field, no server change.

## D4: Revealed chips

`settleRevealed` (task panel properties) removes the property from the revealed set once its editor closes, whether or not a value arrived; with a value the chip stays because the property is set, and clearing the value then removes it. Focus moves to the Add control only when the chip leaves.

**Interface budget**: no new chrome, properties, destinations, scroll regions or shortcuts.
