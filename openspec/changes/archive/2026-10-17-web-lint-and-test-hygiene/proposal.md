# Proposal

## Why

An audit of the web client (UI-14, UI-15, and the DATA-12 follow-up left out of `client-sync-robustness`) found:

- **UI-14**: the web app has no linter. Thirteen `eslint-disable react-hooks/exhaustive-deps` comments suppress nothing, because nothing runs; missing effect dependencies and conditional hooks are never flagged, and suppressions that no longer apply never surface.
- **UI-15**: the web tests are not hermetic and not stable under load. About thirty tests send real requests (happy-dom resolves relative URLs against `http://localhost:3000`, so the run prints `ECONNREFUSED`), and a dozen interaction tests fail when the machine is busy with parallel workers: they assert after a fixed sleep (`flush(40)`), count loop iterations instead of time, or hit the 5 s default test timeout while seeding IndexedDB. One of them exposed a real race: a chip revealed from the Add menu stayed revealed once its value arrived quickly, so clearing the value left an empty chip.
- **Service worker clock**: Snooze and Dismiss on a reminder notification are written by `public/push-sw.js`, which stamps its ops with the raw device clock. The app corrects its clock towards server time (`hlc.ts`, sync-convergence), but that offset lives only in the page's memory. On a device whose clock is far off, notification actions were stamped differently from the app's edits, and when the worker uploaded them itself it removed them from the outbox even if the server refused them (a `clock_skew` refusal), so the change never reached other devices.

## What Changes

- ESLint (flat config) with `typescript-eslint`'s parser and `eslint-plugin-react-hooks`: `rules-of-hooks` and `exhaustive-deps` as errors, unused suppressions as errors, no stylistic rules. `npm run lint` in `web/`, `make web-lint`, part of `make check`. Every finding is fixed or carries a reason after `--`.
- `web/src/test-setup.ts` replaces `fetch` with a stub that rejects and fails the test naming the request; tests that need the network mock it (`mockFetch` in `ui/test-utils.tsx`, or their own `vi.stubGlobal`). A shared, wall-clock `waitFor` replaces the fixed sleeps in the tests that flaked; the test timeout is 30 s so busy workers only make tests slower.
- The app stores its clock offset in the `meta` store (`hlc_offset`) after each sync and seeds it at start; the service worker stamps its ops with `Date.now() + offset` (still after the stored HLC), and keeps refused ops queued for the app's sync, which stamps them again (clock refusal) or applies the server's answer.
- A revealed property chip stops being "revealed" once its value is set, so clearing the value removes it.

No op schema, API or data model change; one new `meta` row on the device; no new environment variable. Not **BREAKING**.

**Out of scope**: wiring `make web-lint` into the CI workflow (a separate change edits `.github/workflows`); the React Compiler diagnostics of `eslint-plugin-react-hooks` 7 (see design); replacing every fixed sleep in the suite (only the ones that flaked); `fire_at` of a snoozed reminder (a wall-clock time, not an op timestamp). ROADMAP.md item advanced: none; this hardens existing behaviour and tooling.
