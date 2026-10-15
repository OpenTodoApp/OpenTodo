# Proposal

## Why

There is no way to find a task by name in the web app. The only text search is the `search:` term of the Filter view (`web/src/lib/filter/parse.ts:119-130`), which lives behind `g f` and needs the filter grammar; projects, labels and saved views are reached only through the sidebar, and settings through fourteen section pages. Every action has a shortcut or a menu, but a person who does not remember `Shift+O` or where "Set as start view" lives has to hunt for it. Todoist, Things and Linear all answer this with one box on `Ctrl`/`⌘`+`K` that finds anything and runs anything. OpenTodo's keyboard-first principle makes the gap more visible, not less.

## What Changes

- **One box on `Ctrl`/`⌘`+`K`, and a search button in the header for touch and mouse.** It opens from every screen (also while typing in a field, except inside the notes editor, where `Ctrl`/`⌘`+`K` already inserts a link). Below 640 px it is a bottom sheet, as every overlay is.
- **Search over local data.** Typing finds tasks (title and notes text, open ones first, completed ones marked, deleted ones never), projects (archived ones marked), labels, saved views and dashboards, and Settings sections. Matching is the smart picker's: exact, then word prefix, then letters in order, ignoring case and accents. Nothing is sent to the server, nothing is indexed on it: the index is built on the device from the local tables, which hold plaintext for end-to-end encrypted accounts too (`web/src/lib/e2ee.ts:7-9`).
- **Filter queries inline.** When the typed text is a valid filter query with at least one filter term (`@errand & p1`, `due <= friday`, `#Work & overdue`), the box lists the matching tasks and offers "Open in Filter view". Plain words never produce a syntax error: they are a text search.
- **Every command by name.** A command registry lists what the app can do: go to any view, calendar, Help and Settings section; act on the selected task (complete, priority, labels, assign, schedule, estimate, skip occurrence, this occurrence only, trash); act on the current project, saved view or label (every item of their action menus); save the current filter as a view; new task, project, label and dashboard; sync now, keyboard shortcuts, Vim keybindings on or off. Each command shows its shortcut, runs through the same function as the button or key it stands for, and is listed only when it applies. A guard test keeps the registry in step with the action menus.
- **Ranking and memory.** One ranked list: exact matches first, then word-prefix, then fuzzy; ties by this device's pick history (`web/src/lib/pickRank.ts`), then by kind (commands, tasks, projects, labels, views, settings). An empty box shows the commands for the current context and the entries picked most recently on this device.
- **Help and docs.** `?` lists the new shortcut; a new user guide page "Search and commands" explains the box; the Filter reference mentions the inline use.

Out of scope:
- Server-side search, a search API route, or search in the CLI and MCP (`search_tasks` already exists there).
- Searching comments, history, activity or the Help pages from the box (Help keeps its own search; the box offers "Search help for …" as a command).
- Prefix modes (`>` for commands, `#` for projects): `#` is filter syntax, and one ranked list makes modes unnecessary for the first version.
- Commands on several tasks at once. `bulk-edit` adds the selection; once both changes have landed, the registry's task commands act on the selection (`bulk-edit` carries that task).
- Custom keyboard shortcuts (ROADMAP "Considered and set aside").
- Replacing the Vim `:` command line. It keeps its own table; `Ctrl`/`⌘`+`K` works in Normal and Insert mode.

ROADMAP: advances "Next: Parity and depth" row 3, "Search and command palette", `search-and-command-palette`. The row's notes are followed as written (local index, filter syntax inline, every menu action by name, no new route). One refinement: the index is kept in memory and rebuilt from the Dexie tables while the box is open rather than persisted as a new IndexedDB table, because the tables already hold the plaintext and a few thousand rows fold in milliseconds (design D2).

Nothing here is **BREAKING**: no op field, no API route, no environment variable, no migration. The command registry is interface state.

Depends on: nothing. Builds on the smart picker engine of `ui-primitives` (`web/src/ui/Combobox/`), which is shipped.

## Capabilities

### New Capabilities
- `command-palette`: the one box that finds any task, project, label, saved view or Settings section from local data and runs any command by name; how it opens, what it lists, how entries rank, what Enter does, and that it works offline and on encrypted accounts without the server taking part.

### Modified Capabilities
- `web-app`: "Keyboard navigation" gains `Ctrl`/`⌘`+`K` as a primary action that also fires while typing in a field (except the notes editor), and the `?` list shows it.

## Impact

- **Web:**
  - new `web/src/app/palette/` (lazy chunk, loaded on first open like `help/` and `assistant/` in `Shell.tsx:34-41`): the dialog, the index, the command registry, the `:help`-style context
  - `web/src/app/Shell.tsx` (the shortcut, the header button, mounting the chunk)
  - `web/src/app/listActions.ts` (the registry reads the selected task through the existing `listState()`); `FilterView.tsx` and `SavedViewView.tsx` register their list state, which only `TaskListView.tsx:647` does today
  - `web/src/lib/shortcuts.ts` (one row), `docs/keyboard.md` regenerated by `make docs`
  - `web/src/ui/Combobox/match.ts` and `useCombobox.ts` are reused as they are; `web/src/lib/pickRank.ts` gets the rank context `palette`
  - `scripts/e2e-layout.mjs`: a `command-palette` overlay on the Inbox screen
- **Server:** none. No route, no change to `internal/httpapi/demo.go`.
- **Docs:** new `docs/search.md` (user guide), a paragraph in `docs/filters.md`, the keyboard page, the help bundle (`make docs`), CHANGELOG.
- **Size:** no new dependency. The palette chunk is an estimated 6–8 KB gzipped (dialog, registry, index); the main bundle gains the shortcut and the button. Memory: the in-memory index holds one folded string per task, project, label and view, about 100 bytes per task, freed when the box closes. Go binary and image unchanged apart from the embedded bundle.
