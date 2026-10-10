# Tasks

## 1. Preference and plumbing

- [x] 1.1 Add the device-local preference store (`useVimEnabled`, `localStorage` key, cleared on sign-out) and the "Vim keybindings" switch in `SettingsView`; verify `npm test` passes new `vim/prefs.test.ts` (`defaults to off`, `toggle notifies subscribers`, `sign-out clears it`) and the switch renders in the browser
  - `web/src/app/vim/prefs.ts`; switch in a new Settings → Keyboard section. App's sign-out calls `clearVimPref()` next to `clearLocalData()`, and `sign-out clears it` tests that function rather than the whole App logout. The browser smoke toggled the switch.
- [x] 1.2 Expose list actions from `TaskListView` through `listActions.ts` (move, first, last, open, toggle complete, delete, open quick add) reusing the existing `mutate()`-backed helpers; verify `npm test` passes `listActions.test.ts` (`deleteSelected writes a tombstone op`, `toggleCompleteSelected flips completed_at`) and existing `ops.test.ts` still passes
  - TaskListView registers its list *state* in `listActions.ts`; the actions themselves are built in `vim/actions.ts` so they ship in the lazy chunk (see design implementation notes). Also covered: priority, J/K moves, close panel, read-only tasks skipped, board columns.

## 2. Vim layer

- [x] 2.1 Create `web/src/app/vim/VimLayer` with the mode state machine (Normal/Insert/Command, Insert derived from focus), the capturing `keydown` dispatcher, the 1 s pending-key buffer and count accumulator, mounted lazily from `Shell` only when enabled; verify `npm test` passes `vim/dispatch.test.ts` (`gg selects first`, `G selects last`, `3j moves three`, `dd deletes`, `d then timeout does nothing`, `2 then timeout sets priority 2`, `x toggles completion`, `o opens quick add`, `i opens panel`, `keys in Insert are not intercepted`, `non-Vim keys propagate`)
  - All named tests pass, plus `g t` and `g g` in both orders, `2j` versus `2`, and `outside task lists only : is taken`. `gg` uses Shell's existing `g` prefix flag instead of its own timer (design implementation notes).
- [x] 2.2 Escape semantics: Insert → Normal keeping field content, Command → cancel, Normal untouched; verify `npm test` passes `escape in field returns to Normal and keeps value` and `second escape reaches default handler`
  - Fields inside dialogs keep their own Escape (`a field inside a dialog keeps its own Escape`).
- [x] 2.3 Command line with completion over the static table plus project names, `new <title>` using the current view defaults, unknown-command message; verify `npm test` passes `vim/commands.test.ts` (`:tod completes to today`, `:project pre matches by prefix`, `:new creates task with view defaults`, `:frobnicate shows message and no op`, `:q closes panel`)
- [x] 2.4 Mode indicator in the shell footer showing mode and pending keys/count; verify `npm run build` succeeds and the indicator shows `NORMAL`, `INSERT` while typing and `COMMAND` after `:` in the browser
  - Browser smoke: NORMAL after enabling, INSERT after `q`, COMMAND after `:`.
- [x] 2.5 `?` overlay gains `extraSections`; the Vim layer supplies its table; `:help` opens the overlay; default help shows a hint when Vim is off; verify `npm test` passes `help lists Vim section only when enabled`
  - The overlay moved unchanged to `web/src/app/ShortcutHelp.tsx`; test in `shortcutHelp.test.tsx`.

## 3. Docs and integration

- [x] 3.1 Update `README.md` keyboard section and `CHANGELOG.md` Unreleased; verify links resolve and the listed bindings match the dispatcher table
  - README keyboard bullet and a "Vim keybindings" feature row; CHANGELOG Unreleased. There is no separate keyboard doc under `docs/`; the in-app `?` table (`vim/help.ts`) is the reference.
- [x] 3.2 Browser end-to-end run against the production binary: enable the switch, `3j`, `gg`, `G`, `dd` while offline then reconnect and confirm the deletion on a second device, `:new` in a project, `:today`, `?` shows the Vim section, disable the switch and confirm default behavior; verify the run finishes with "E2E OK" and no console errors
  - One Playwright/Chromium run against `bin/opentodo`, finished with "E2E OK" and no console errors. It covered: switch on without reload; `3j`, `G`, `gg`; lone `2` setting priority after the timeout; `dd` typed into quick add with nothing deleted, and Escape keeping the text; `dd` offline, reconnect, tombstone on the server, absent on a second signed-in context (where the indicator is off: the setting is per device); `:frobnicate` message; `:project wor`; `:new Buy milk` in the project; `:tod` (prefix of `:today`) opening Today; `?` and `:help` showing the Vim section; switch off, then `dd` does nothing, `:` opens nothing and the hint is back.
- [ ] 3.3 Record bundle sizes before/after (`npm run build`) confirming the default chunk grew by under 1 KB gzipped and the Vim chunk is separate; verify numbers noted in the PR
  - Recorded, but the target is not met. The Vim chunk is separate (4.10 kB gzipped). The default chunk grew **+1.47 kB gzipped** (236.69 → 238.16 kB), about 0.8 kB of which is Vite's fixed cost for the app's first dynamic import. Details in design.md "Size impact"; whether that is acceptable is for the reviewer to decide.
- [x] 3.4 Run `make check`; verify it passes including `openspec validate --all --strict`
