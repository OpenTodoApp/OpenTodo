# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/` unless another command is named.

## 1. Registry and dispatcher

- [x] 1.1 Add `label` to `Shortcut`, fill it for every entry whose keys include a sequence (other rows show the head of their description, see 3.2), and add the continuations helper (`pendingContinuations` in the dispatcher, which knows the frames); verify with `shortcuts.test.ts` (a sequence entry without a label or with one over 24 characters fails, `continuations([g])` in the global scope lists `t` Today and `i` Inbox, de-duplicated).
- [x] 1.2 Expose the pending prefix from `dispatch.ts` (`subscribePrefix`, `pendingPrefix`, `holdPrefix`, `cancelPrefix`) and route Esc to cancelling a pending prefix before any scope; verify with `dispatch.test.ts` (subscribers see arm and clear, a held prefix does not expire after 800 ms, Esc while pending clears it and does not reach the panel's Escape handler).

## 2. The spotlight

- [x] 2.1 Add `web/src/app/shortcuts/Spotlight.tsx` (250 ms delay, the "g +" line, grouped suggestions, click to run, close button, focus return) and mount it in the shell; verify with `spotlight.test.tsx` (happy-dom): hesitation opens it, `g t` within 150 ms never renders it, a late `u` opens Upcoming, Esc and the close button cancel with focus returned, `z` closes it, `g k` is absent when the assistant is off, Vim lists `g g`, typing `g` in an input opens nothing.
- [x] 2.2 Add the `Shortcuts/Spotlight` story (light and dark, 390 and 1280) and add the spotlight to the layout check's overlays; verify with `make ui-check` and `ENGINES=chromium make layout-check`.

## 3. Keycaps and the cheat sheet

- [x] 3.1 Turn `Kbd.tsx` into the keycap group (`Keys`: chords, "then", "or", `nowrap` keycaps in a wrapping flex container) and set `.ui-kbd` to `white-space: nowrap` (still inline, so keycaps elsewhere keep their look); verify with the keycaps case in `spotlight.test.tsx` (`g t` renders two keycaps and "then", `j / ↓` renders "or", no keycap text contains a space-separated alternative).
- [x] 3.2 Rebuild `ShortcutHelp.tsx` as one-line rows (label or clamped description, condition under it, keys at the end), CSS columns by width, `size="xl"` and the pinned search field; verify with `shortcutHelp.test.tsx` (context first, search "dead", the proposed-changes row shows "proposed changes" outside the keycaps, every row has an accessible name with the full description) and the `Shortcuts/Cheat sheet` story baselines at 360, 768 and 1280 in both themes via `make ui-check`.
- [x] 3.3 Render the keyboard guide's keys with the same rules (generator for `docs/keyboard.md`, Help `kbd` style); verify with `make docs` producing no diff after regeneration and `npm run docs:check`.

## 4. Docs and integration

- [x] 4.1 Update `docs/keyboard.md` (the spotlight: hesitate after `g`, Esc to cancel), the Help page "Keyboard shortcuts" and `docs/interface-guide.md` (the spotlight among overlays); verify with `npm run docs:check`.
- [x] 4.2 Run `make check`; verify it passes, and record the entry chunk size difference here.
- [x] 4.3 Run `make openspec-validate`; verify it passes.

- Verified by CI on each merged pull request (#180, #181, #183–#189: Web, Server, Checks, Layout and UI checks). Entry chunk on main after the whole series: 323.79 KB gzipped (323.12 KB before `task-panel-facets`; facets alone −1.05 KB, the When editor, the title editors and inline editing together +1.72 KB).
