# Tasks

## 1. Registry and dispatcher

- [x] 1.1 Add the "Group and order" section and the 13 `arrange.*` entries (`r g s|j|n|d|p|l`, `r o m|p|d|c|l|t`, `r r`) to `web/src/lib/shortcuts.ts`, with labels for the spotlight. Verified by `src/lib/shortcuts.test.ts` (no conflicts, every key parses) and the per-entry dispatch table in `src/app/shortcuts/dispatch.test.ts` via `npm test` in `web/`.
- [x] 1.2 Name the middle steps `r g` and `r o` (`SEQUENCE_STEPS`) and list a longer sequence by its step in `pendingContinuations`; spotlight groups Display options, Group by and Order by. Verified by "a three-key sequence lists its named middle steps" in `src/app/shortcuts/dispatch.test.ts`.
- [x] 1.3 The Vim layer leaves the keys of another pending sequence to the dispatcher, and `isGPending` means `g` only. Verified by "leaves every key of another sequence" in `src/app/vim/dispatch.test.ts`.

## 2. Lists

- [x] 2.1 `useDisplayKeys` registers handlers only for the choices the page's panel offers and writes through the panel's write, announcing the new setting in the toast. Used by project and label lists (`useListDisplay`) and saved views. Verified by `src/app/displayKeys.test.tsx` (project, label page, saved view, typing).
- [x] 2.2 The `?` sheet puts Group and order first in a project list, a label page and a saved view. Verified by `src/app/shortcutHelp.dom.test.tsx`.
- [x] 2.3 Strings in all six catalogues. Verified by `make i18n-check`.

## 3. Docs

- [x] 3.1 Regenerate `docs/keyboard.md` and the in-app help (`npm run docs:build` in `web/`), mention the keys in `docs/group-and-order.md`. Verified by `npm run docs:check` in `web/`.
- [x] 3.2 CHANGELOG entry under Unreleased.
