# Tasks

## 1. Preference and plumbing

- [ ] 1.1 Add the device-local preference store (`useVimEnabled`, `localStorage` key, cleared on sign-out) and the "Vim keybindings" switch in `SettingsView`; verify `npm test` passes new `vim/prefs.test.ts` (`defaults to off`, `toggle notifies subscribers`, `sign-out clears it`) and the switch renders in the browser
- [ ] 1.2 Expose list actions from `TaskListView` through `listActions.ts` (move, first, last, open, toggle complete, delete, open quick add) reusing the existing `mutate()`-backed helpers; verify `npm test` passes `listActions.test.ts` (`deleteSelected writes a tombstone op`, `toggleCompleteSelected flips completed_at`) and existing `ops.test.ts` still passes

## 2. Vim layer

- [ ] 2.1 Create `web/src/app/vim/VimLayer` with the mode state machine (Normal/Insert/Command, Insert derived from focus), the capturing `keydown` dispatcher, the 1 s pending-key buffer and count accumulator, mounted lazily from `Shell` only when enabled; verify `npm test` passes `vim/dispatch.test.ts` (`gg selects first`, `G selects last`, `3j moves three`, `dd deletes`, `d then timeout does nothing`, `2 then timeout sets priority 2`, `x toggles completion`, `o opens quick add`, `i opens panel`, `keys in Insert are not intercepted`, `non-Vim keys propagate`)
- [ ] 2.2 Escape semantics: Insert → Normal keeping field content, Command → cancel, Normal untouched; verify `npm test` passes `escape in field returns to Normal and keeps value` and `second escape reaches default handler`
- [ ] 2.3 Command line with completion over the static table plus project names, `new <title>` using the current view defaults, unknown-command message; verify `npm test` passes `vim/commands.test.ts` (`:tod completes to today`, `:project pre matches by prefix`, `:new creates task with view defaults`, `:frobnicate shows message and no op`, `:q closes panel`)
- [ ] 2.4 Mode indicator in the shell footer showing mode and pending keys/count; verify `npm run build` succeeds and the indicator shows `NORMAL`, `INSERT` while typing and `COMMAND` after `:` in the browser
- [ ] 2.5 `?` overlay gains `extraSections`; the Vim layer supplies its table; `:help` opens the overlay; default help shows a hint when Vim is off; verify `npm test` passes `help lists Vim section only when enabled`

## 3. Docs and integration

- [ ] 3.1 Update `README.md` keyboard section and `CHANGELOG.md` Unreleased; verify links resolve and the listed bindings match the dispatcher table
- [ ] 3.2 Browser end-to-end run against the production binary: enable the switch, `3j`, `gg`, `G`, `dd` while offline then reconnect and confirm the deletion on a second device, `:new` in a project, `:today`, `?` shows the Vim section, disable the switch and confirm default behavior; verify the run finishes with "E2E OK" and no console errors
- [ ] 3.3 Record bundle sizes before/after (`npm run build`) confirming the default chunk grew by under 1 KB gzipped and the Vim chunk is separate; verify numbers noted in the PR
- [ ] 3.4 Run `make check`; verify it passes including `openspec validate --all --strict`
