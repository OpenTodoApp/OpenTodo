# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Global keys live in one window listener in `Shell.tsx:100-151`.** It returns early on `metaKey || ctrlKey || altKey` and while typing, handles the `g` prefix through `signals.ts` (`setGPending`, 800 ms), `?` and `Shift+I`. Lists add their own listeners (`TaskListView.tsx:437-640`, `useListKeys.ts`). The Vim layer, when on, installs a capturing listener first (`vim/VimLayer.tsx:72-73`) and lets every modified key through (`vim/dispatch.ts:107-111`).
- **The notes editor owns `Ctrl/⌘+K`** for links (`lib/shortcuts.ts`, "Ctrl/⌘+B, I, Shift+X, E, K (in the notes)"), through a ProseMirror keymap on the contenteditable.
- **The smart picker engine is reusable and sized for this.** `ui/Combobox/useCombobox.ts` takes a `source`, `getKey`, `getLabel`, `getSecondary`, `getGroup`, `rankContext` and `onPick`; `match.ts` folds case and accents and ranks exact > word prefix > fuzzy with `prepare()` for large sources (the Storybook story "TenThousandOptions" exists for that). `ComboboxPanel` renders field plus list without a trigger, as `LabelPicker` does inside a dialog. `lib/pickRank.ts` keeps per-device pick history in the `pickHistory` table (200 rows per context, 14-day half-life).
- **Local tables hold plaintext.** `lib/e2ee.ts:7-9`: "The device is the trust boundary: local tables hold plaintext, and nothing leaves the device for an encrypted account except ciphertext". Undecryptable titles are flagged by `task._e2ee.raw.title` and shown as `[Cannot decrypt]` (`TaskRow.tsx:73,118`).
- **Filter parsing and evaluation are pure** (`lib/filter/parse.ts`, `evaluate.ts`: `compile(ast, {today, labels, projects})`), the Filter view keeps the last good query on a syntax error and records history through `lib/filter/history.ts`.
- **Actions already exist as functions.** Navigation is `navigate(route)` (`router.ts`); task actions are `lib/ops.ts` helpers and the list's own follow-ups (parent prompt, archive offer) exposed through `registerListState` / `listState()` in `listActions.ts` (registered by `TaskListView.tsx:647-666` only); project, view, label and section actions are the `MenuItem onSelect` handlers in `ProjectHeader.tsx`, `ViewsView.tsx`, `LabelsView.tsx`, `Sections.tsx` (being rebuilt by `labels-and-menus`, capability `action-menus`); Vim's `:` commands are a static table in `vim/commands.ts`.
- **Lazy chunks are the pattern for optional UI**: Help, the assistant and the Vim layer are `lazy()` imports in `Shell.tsx:34-41`.
- **Shortcuts have one source**: `lib/shortcuts.ts` feeds the `?` overlay and `docs/keyboard.md` through `make docs`.

## Goals / Non-Goals

**Goals:**
- One ranked list over entities and commands, built from the picker engine, with no new dependency and no new table.
- A command registry that is the single list of "what the app can do by name", checked against the action menus so it cannot silently fall behind.
- Nothing leaves the device: no route, no request, index in memory.

**Non-Goals:**
- A persisted full-text index, stemming or multi-language tokenisation. The picker's fold-and-prefix matching is enough for titles; the Help search (`web/scripts/docs/search-core.mjs`) keeps its stemmer for prose.
- Unifying the Vim `:` command line with the registry. The table stays; a later change can make `:` complete from the registry.
- Acting on several tasks: `bulk-edit`.

## Decisions

### D1. The palette is a lazy chunk behind a global shortcut and a header button

`web/src/app/palette/` exports `CommandPalette` (a `Dialog` from `app/overlay` with `size="md"`, role dialog, label "Search and commands"), mounted by `Shell` through `lazy()` on first open, like `AssistantRoot`. The Shell listener gains one branch *before* its modifier early-return: `(e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k'`, which opens the palette and calls `preventDefault()` unless the target is inside the notes editor (`[data-notes-editor]`, the ProseMirror root; the editor's keymap runs on the element and stops propagation, and the Shell branch checks `closest()` as a belt and braces). The header gets a `search` icon button labelled "Search and commands (Ctrl+K)" next to the `?` button, always visible, so touch users have a way in.

While the palette is open, the Shell's and the lists' listeners must not act on typed letters: the dialog's `onKeyDown` stops propagation, as `Dialog.tsx` already does, and `useListKeys` already ignores keys behind a `[role="dialog"]`.

- **Alternative: `/` to open, like GitHub.** Rejected. `/` edits the query in a saved view (`lib/shortcuts.ts`), and `Ctrl/⌘+K` is what the roadmap and the comparison pages promise.
- **Alternative: in the main bundle.** Rejected. The registry imports every action's module; the chunk keeps the first paint unchanged, and the Shell pattern exists.

### D2. In-memory index from live queries, folded once per row

`palette/index.ts` builds `Entry` objects:

```
{ kind: 'task' | 'project' | 'label' | 'view' | 'settings' | 'command' | 'filter',
  key, label, secondary?, path?, marker?, icon?, shortcut?, run(ctx) }
```

While the dialog is open, `useLiveQuery` reads `db.tasks` (not deleted), `db.projects` (not deleted), `db.labels`, `db.views`; `SETTINGS_SECTIONS` (filtered by `visible(user)`) and the registry are static. Each row becomes an entry whose folded text comes from `match.ts` `prepare()`; a `WeakMap<row, Prepared>` keyed by the row object avoids refolding rows a live query re-emits unchanged (Dexie returns new objects per query, so the cache key is `${id}:${JSON.stringify(_clock?.title)}`-style per kind; the design accepts refolding on every change, a few milliseconds for 5 000 rows). The source handed to `useCombobox` is the concatenated entry array; `getSecondary` returns the task's project name and due label (`describeDue`), the project's parent path, the view's kind, the settings section's description. Task notes are matched through `task.description` (the plain-text projection of `notes_doc`, kept in step by `reconcileNote`), never the Yjs document.

Rows the device cannot decrypt (`_e2ee.raw.title`) are indexed by the text the app shows (`[Cannot decrypt]`), so ciphertext is never matched or displayed.

The box closes → the component unmounts → the index is garbage. No Dexie version, no table, no persistence.

- **Alternative: a persisted inverted index in a new Dexie table, updated by `applyOps`.** Rejected for now. It adds a table, a version bump, a write on every op and a consistency problem on `clearLocalData`, to save a few milliseconds on open. Revisit if accounts with tens of thousands of tasks appear; the entry shape does not change.
- **Alternative: server search.** Rejected. Encrypted accounts hold ciphertext on the server (`end-to-end-encryption`, "Consequences for server-side reads"), and the roadmap row says "without the server seeing anything".

### D3. One ranked list: tier, then pick history, then kind

`useCombobox` already orders by `Match.tier` and then by `rankBy(scores)` within a tier and keeps source order for the rest (`useCombobox.ts`, `rankBy` in `pickRank.ts`). The palette passes `rankContext: 'palette'` and builds the source in kind order (commands, tasks, projects, labels, views, settings), so "then by kind" falls out of source order. Open tasks are placed before completed ones and live projects before archived ones inside their kind, with `marker` set for the latter two ("completed", "archived") shown as a badge, the same way `pickerSources.ts` marks them. The list is capped at 50 options with a trailing "n more match — keep typing" line (`ComboboxList` gets an optional `limit` and `moreText`, a small addition).

With an empty query the source is: context commands (those whose `available(ctx)` names the selected task or current view), then the 10 highest-scored entries of the `palette` pick history that still exist, then nothing else. Typing switches to the full source.

- **Alternative: grouped sections with headings (Commands / Tasks / …).** Rejected. With fuzzy matching a heading-per-kind list puts the best task below five weak commands; VS Code's one-list-with-kind-badges reads better and the Combobox renders it already (`getSecondary`, `renderLeading` for the kind icon).

### D4. Filter queries are detected, never reported

`palette/filterEntries.ts`: on every (debounced, 150 ms as in `FilterView.tsx:27`) query change, `parse(text)` in a try/catch. When it returns an AST that `hasFilterTerm(ast)` (any node other than `search`) accepts, `compile(ast, {today, labels, projects})` runs over the same visible tasks the Filter view uses (`visibleTasks()` minus archived projects), and the result becomes: one `filter` entry "Open in Filter view: `<query>`" pinned first (`pinned` in `ComboboxConfig`), then up to 20 task entries flagged `fromFilter` so they are not deduplicated against text matches of the same task (the task entry wins; the filter copy is dropped). A parse error or a query that is only `search:` yields nothing extra. "Open in Filter view" navigates with the query (`FilterView` accepts an initial query through the route, `{ view: 'filter', q }`, a one-field addition to `router.ts` mirroring `help`'s `q`) and records it in the filter history.

- **Alternative: show the syntax error inline.** Rejected. Half-typed words are errors in that grammar (`Unknown term "ren"`); the palette is a search box first.

### D5. The command registry

`palette/registry.ts`:

```
interface Command {
  id: string; label: string; keywords?: string[]; icon?: IconName; shortcut?: string
  /** Listed only when it returns a label suffix (e.g. the task title) or true. */
  available(ctx: PaletteContext): string | boolean
  run(ctx: PaletteContext): void | Promise<void>
}
```

`PaletteContext` is built by `Shell` when the palette opens: `route`, `user`, `today`, the `listState()` (selected task, `toggleComplete`, read-only test), the current project, view or label row (live query by route), the Filter view's current query, `navigate`, `openHelp`, `syncNow`, the Vim preference setter, `setShowHelp`, and openers for the pickers and prompts the Shell can reach (`openTaskInList` for tasks; `estimateFocus`, `placeInDay` from `signals.ts`). Commands:

- **Go to**: every `Route` view the sidebar and `g` reach (`Shell.tsx:115-136`), each Settings section (`SETTINGS_SECTIONS`, filtered by `visible`), Help, Import.
- **Selected task** (when `listState()?.selected()` names a writable task): complete / reopen (through `listState().toggleComplete`, so the parent prompt and archive offer still happen), priority 1–4, labels (opens the picker: `TaskListView` exposes `setPickerFor` and `setAssignFor` through `ListState`, two new getters), assign, schedule in Day view (`placeInDay`), edit estimate, skip occurrence, this occurrence only, move to Trash, open.
- **Current project / view / label**: every action of its menu, taken from the same handlers the menus call. To make that true, the menus' handlers move out of the components into `lib/projects.ts`, `lib/views.ts` and `lib/labels.ts` functions where they are not already there (`reorderView`, `setPinned`, `archiveProject` already are), and the components and the registry both call them. Actions that need a target or a name (Move to, Rename, Merge into) run the same prompt or picker the menu opens (`NamePrompt`, the picker step `action-menus` specifies).
- **Create**: new task (focuses quick add, or opens the Inbox and focuses it when the current screen has none), new project (sidebar's prompt), new label, new dashboard.
- **App**: save filter as view (Filter view only), sync now, keyboard shortcuts, Vim keybindings on/off (checkable, `vim/prefs.ts`), search Help for "<text>" (navigates to `{view:'help', q}`; available whenever text is typed).

The registry is a plain array; `labels-and-menus` must add commands for the items it introduces and the guard test (D6) tells it so.

- **Alternative: derive commands from the rendered menus at runtime (read `data-menu-label`).** Rejected. The menus are mounted only while open and only on their screen; the palette must list "Archive project" without the project menu being open.
- **Alternative: merge with `vim/commands.ts`.** Rejected here. The `:` table has its own grammar (`project <name>`, `new <title>`); it can later complete from the registry without changing either spec.

### D6. Guard test for registry completeness

`palette/registry.test.tsx` renders each action menu's item list (`ProjectHeader` menu, `ViewMenu`, the label menu, the section menu) with a fixture row and collects `data-menu-label` values (`ui/Menu.tsx` sets it on every `MenuItem`), then asserts each label is the `label` of a registry command whose `available()` returns truthy for a context holding that row. It fails naming the missing label. The inverse check (every command has a label and an `available`) is a type, not a test.

### D7. What Enter does

Picking records the pick (`recordPick('palette', key)`, fire-and-forget as the Combobox does) and runs the entry: tasks → `openTaskInList(task)` (the existing channel in `signals.ts` navigates to the project or Inbox and opens the panel; `TaskListView.tsx:359-366` keeps the panel open for a task outside the rows, which covers completed tasks); projects, labels, views, dashboards, settings → `navigate`; commands → `run(ctx)`. The dialog closes before the action runs so focus restoration does not fight the action's own focus (quick add, a prompt). Filter entries navigate to the Filter view with the query.

## Risks / Trade-offs

- **[`Ctrl/⌘+K` is the browser's address-bar shortcut in Chrome and Firefox]** → `preventDefault()` on keydown is honoured by both for `Ctrl+K` and `⌘+K`; the layout check opens the palette in Chromium and WebKit. The header button is the fallback on browsers that reserve it.
- **[Refolding the whole index on every live-query emission while open]** → Measured in a unit test with 5 000 synthetic tasks (`prepare` on 5 000 strings is single-digit milliseconds); the live query is debounced by Dexie's own batching. If it shows, the per-row cache in D2 is the fix.
- **[Commands act on stale list state]** → `listState()` getters read the latest render (`live.current` in `TaskListView.tsx:644-646`); the context is rebuilt when the palette opens and the selected task is re-read at `run` time.
- **[A menu action with a target (Move to) cannot run without its picker]** → The command opens the same picker or prompt the menu would, so the user finishes the action where the menu would have; nothing runs blind.
- **[Filter evaluation on every keystroke]** → Same debounce and compile path as the Filter view, capped at 20 entries; the `search:`-only case is skipped.
- **[`labels-and-menus` is in flight and rewrites the same menus]** → The registry calls lib functions, not components; the guard test is what tells whichever change lands second what to add. The design has been written against the `action-menus` delta, which already specifies the picker step and confirmations the commands reuse.

**Size:** no dependency. The palette chunk is an estimated 6–8 KB gzipped; the main bundle grows by the shortcut branch and the header button. Memory while open: one `Prepared` per entry, about 100 bytes per task. The Go binary and image change only by the embedded bundle; runtime memory on the server is unchanged.

## Migration Plan

None: no data, no schema, no route. Rollback is the previous binary; nothing is left behind except `pickHistory` rows with context `palette`, which `clearLocalData` removes at sign-out like every other context.
