# Tasks

## 1. Shortcut, header button and chunk (design D1)

- [x] 1.1 Add the `Ctrl/⌘+K` branch to the Shell key listener (before the modifier early-return, skipped inside `[data-notes-editor]`), the header search button, and a `lazy()` `CommandPalette` chunk under `web/src/app/palette/` with a `Dialog` shell. Verify with a Shell test: `Ctrl+K` from the Inbox, from the quick-add field and `⌘+K` open the dialog with `preventDefault` called, `Ctrl+K` inside the notes editor does not, Escape closes and returns focus (`npm test` in web/).
- [x] 1.2 Add the `Ctrl/⌘+K` row to `web/src/lib/shortcuts.ts` (section `everywhere`) and regenerate `docs/keyboard.md` with `make docs`. Verify with `npm run docs:check` in web/.
- [x] 1.3 Add a `command-palette` overlay to `scripts/e2e-layout.mjs` on the Inbox screen (trigger: the header button). Verify with `make layout-check` at 360, 390 and 768 px in Chromium and WebKit.

## 2. Index and ranking (design D2, D3)

- [x] 2.1 Build `palette/index.ts`: entries for tasks (title + `description`, project and due as secondary, "completed" marker), projects (parent path, "archived" marker), labels, views and dashboards, Settings sections (visible to the user), with folded text through `match.ts` `prepare()` and undecryptable rows indexed by their shown text. Verify with unit tests for the spec scenarios ("appoint" finds the task by notes, "cafe" finds "Café", completed after open, deleted never listed, `[Cannot decrypt]` rows never match ciphertext) and a timing test folding 5 000 tasks under 50 ms (`npm test` in web/).
- [x] 2.2 Wire the entries into `useCombobox` with `rankContext: 'palette'`, source in kind order, a 50-entry cap with "n more match", and the empty-query source (context commands, then recent picks). Verify with a component test: "pas" ranks "Renew passport" before "Pre-sales"; a picked project ranks first on a tie after `recordPick`; an empty box lists context commands first.
- [x] 2.3 Picking runs the entry (`openTaskInList` for tasks, `navigate` for the rest) and records the pick. Verify with a component test: picking a task of project "Home" navigates to `/project/<id>` with the detail panel open; picking a completed task still opens its panel; `pickHistory` gains a `palette` row and `clearLocalData` removes it.

## 3. Filter queries inline (design D4)

- [x] 3.1 Add `palette/filterEntries.ts`: debounced parse, `hasFilterTerm`, compile over the Filter view's visible tasks, "Open in Filter view" pinned first, up to 20 task entries deduplicated against text matches, nothing on a parse error. Verify with unit tests for `@errand & p1`, `@errand &` (no error, no filter entries) and `search: milk` (no filter entries).
- [x] 3.2 Let the Filter view open with a query from the route (`{ view: 'filter', q }`) and record it in the filter history. Verify with a FilterView test and the existing filter history tests.
- [x] 3.3 Document the inline use in `docs/filters.md` (one paragraph under the Filter view introduction). Verify with `npm run docs:check`.

## 4. Command registry (design D5, D6)

- [x] 4.1 Create `palette/registry.ts` with `Command`, `PaletteContext` and the navigation, create and app commands (views, calendars, Trash, Activity, Help, Import, every Settings section, new task / project / label / dashboard, sync now, keyboard shortcuts, Vim on/off, search Help for the text). Verify with unit tests: `available()` hides "Save filter as view" outside the Filter view; "Go to Upcoming" calls `navigate({view:'upcoming'})`; "Vim keybindings" toggles `vim/prefs`.
- [x] 4.2 Expose `setPickerFor` and `setAssignFor` through `ListState`, register list state in `FilterView.tsx` and `SavedViewView.tsx` (today only `TaskListView` does), and add the selected-task commands (complete/reopen via `toggleComplete`, priority 1–4, labels, assign, schedule, estimate, skip occurrence, this occurrence only, trash, open). Verify with tests: no task selected → no task commands; a selected read-only task → no write commands; "Set priority 1" offline writes the op to the outbox (`npm test`).
- [x] 4.3 Move the project, view, label and section menu handlers that still live in components into `lib/projects.ts`, `lib/views.ts`, `lib/labels.ts` and `lib/sections.ts`, call them from both the menus and the registry, and add the current project / view / label commands (every menu item; target or name actions open the same picker or prompt). Verify with the existing menu tests still passing and a registry test that "Pin to sidebar" on a saved view calls `setPinned`.
- [x] 4.4 Add the guard test `palette/registry.test.tsx`: every `data-menu-label` of the four action menus has a registry command available for that row; plant a fake menu item and confirm the test names it. Verify with `npm test`.

## 5. Help and docs

- [x] 5.1 Write `docs/search.md` ("Search and commands": opening, what it finds, filter queries inline, commands, privacy for encrypted accounts) with front matter `specs: [command-palette]`, add the palette's Help link (`screens: [palette]`), and regenerate the help bundle. Verify with `npm run docs:build` and `npm run docs:check` in web/.
- [x] 5.2 Add the empty-input hint ("Type to search, or a command. Filter queries like `@errand & p1` work too") and the `?` overlay wording "Search and commands". Verify with the ShortcutHelp test and an axe check on the open palette in the component test.

## 6. Integration

- [ ] 6.1 Manual smoke on `make dev`: open with `Ctrl+K` from Today, quick add and the notes editor (link, not palette); find a task by notes text; `@errand & p1` lists tasks and opens the Filter view; "Complete <task>" with a selection; "Pin to sidebar" in a saved view; the header button on a 390 px viewport opens a bottom sheet; with Vim keybindings on, `Ctrl+K` works in Normal and Insert mode. Record the result in the change folder notes.
- [ ] 6.2 Run `make check` (go test, web test and build, docs check, ui lint) and `make layout-check`. Verify both pass.

## Workflow follow-up

- Move ROADMAP.md "Next: Parity and depth" row 3 to the Shipped table ("Search and command palette | `search-and-command-palette`").
- Add a CHANGELOG.md entry under Unreleased → Added, linking `docs/search.md`.
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
