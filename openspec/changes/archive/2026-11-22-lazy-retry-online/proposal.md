# A part that failed to load offline comes back online

## Why

Most screens and panels load their code lazily. On a device whose service worker has not cached a chunk yet (the first minutes after signing in on a new device), opening a screen and losing the connection before its chunks arrive leaves that part on "This part of the app could not be shown" with a Reload button. It stays broken after the connection returns, until the person reloads. The browser would fetch the chunk again, but React keeps the failed import of a `lazy()` component and throws it on every render. GitHub issue 1746 caught this in CI: the project and the side panel showed the message, and the quick-add field was gone.

## What Changes

- One `lazy()` for the app (`web/src/lib/lazy.ts`): like React's, but an import that failed is tried again when asked, instead of failing forever. Every `lazy()` from `react` in web/src uses it; ESLint refuses React's own.
- The five loaders that keep a chunk once loaded (`loading ??= import(…)`: the Linked references section and its probe, the template library, the routine starters, the theme computation) forget a failed load, so the next call fetches again.
- The panel boundary (`PanelBoundary`), when what it caught is a code chunk that failed to load while the browser was offline, renders the part again on its own once the browser is back online (the failed imports are tried again first; the first requests after reconnecting can still fail, so it tries again 1, 2 and 4 s later). Every other error keeps the message and the Reload button.

Local data, the op log and sync are untouched; no new environment variable.

## Out of scope

- Caching every chunk earlier (the service worker's precache is its own concern; the end-to-end wait for it is GitHub issue 1746).
- Errors that are not a failed chunk load, and chunks missing after a server upgrade (they keep the reload of "Recovery after a server upgrade").
- New text on the message.

ROADMAP.md: none (a robustness fix of the offline-first promise).

## Capabilities

### Modified Capabilities

- `web-app`: a part that failed to load offline recovers when the connection returns.
