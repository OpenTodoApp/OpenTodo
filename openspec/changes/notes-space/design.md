# Design

## Context

Notes are reached today from the More menu (app-shell "Notes in the More group"), optionally promoted to a primary destination. The Notes page (`notes-page`) has one row of chrome under its header: the search field, then Source, Project and Label pickers (a Filters sheet on a phone), and two-line rows (title and facts, then a preview). The owner asked on 2026-11-10 for notes to stop looking like a task view while staying one step away, for a compact list, and for granular search; then added that notes carry a project and labels like tasks, so search should reach them the way the task filter does.

A sibling change, `notes-graph-page`, is built at the same time. It owns the **List | Graph** toggle in the Notes header, the `/notes?view=graph` route and the graph. This change leaves it a slot in the header and a slot in the Notes sidebar.

## Goals / Non-Goals

Goals: one quiet place that says "you are in notes"; a list where a note is one line; search that narrows by where a note lives, its labels, its kind, its links and its age without a row of pickers; nothing added to the first load beyond the switch.

Non-goals: a second app, a top navigation bar, folders, a third space, tokens on the server.

## Decisions

### D1. Two spaces in the sidebar, switched under the workspace control

A `SegmentedControl` (the existing primitive) with **Tasks** and **Notes** sits under the workspace control, above the destinations. In the Tasks space the sidebar is exactly what it was. In the Notes space the destinations and the groups between the header and the footer are replaced by the Notes sidebar: **All notes** (`/notes`), then a group **Pinned** (the pinned standalone notes in the favourites order), then a group **Recent** (the five most recently changed standalone notes that are not pinned). The workspace control, search, the schedule and the footer are the same in both spaces.

Recent lists standalone notes only: a task note opens its task, which belongs to the Tasks space (D3), so a sidebar row that switches the space under the pointer would be a surprise. Task and project notes are one step away on All notes.

The icon rail shows the switch as two icons stacked (checklist, note), each named in its tooltip; the phone drawer shows it at its top, under the workspace control. The bottom tab bar is unchanged in both spaces: Inbox, Today, Upcoming and Search stay task destinations, as the phone already gets to Notes from the drawer.

Alternatives considered:
- **Status quo, More row (promotable).** Notes stays a task view among Anytime and Trash; promoted, it costs one of six primary slots and the rest of the sidebar still shows projects and counts. Rejected: that is the confusion the owner described.
- **A top navigation bar (Tasks · Notes tabs above the content).** Rejected: it is a row of chrome above every list (the budget allows two: the header and the quick add), there is no desktop top bar by spec (app-shell "No desktop top bar"), and on a phone it would duplicate the tab bar.
- **Notes as a seventh primary destination.** Rejected: the budget is six primary destinations, and Open Loops first already uses all six.

### D2. The space is device state, chosen or followed

The space is stored on the device (`ot.sidebar.space`, `deviceStorage`), never synced and never an op: it is where this device's sidebar is, like a group's open state. Storage refused: the space holds for the visit, from the route. A module store (`web/src/lib/sidebarSpace.ts`, a `resettable()` register) lets the switch, the sidebar and the drawer read it with `useSyncExternalStore`.

Choosing a space in the switch navigates to its home: Notes opens `/notes`, Tasks opens the device's start view (the same resolution as a launch, moved from `Shell.tsx` into `web/src/app/startView.ts` so both use one function). Choosing the space already shown does nothing.

### D3. The route decides the space where it is clear

`spaceOfView(view)` maps a route to a space or to none. The Notes page and a note (`/notes`, `/notes/<id>`) are Notes. Task views, a task, a project, labels, views, the calendar, the method views, Focus, Review, Statistics and the other task screens are Tasks. Settings, Help, Import, the theme editor, the Assistant page, the Trash (which holds notes too) and the sign-in screens are neutral and keep the space as it was. Any navigation, from a link in a note, the palette, a notification or a `g` key, updates the space through the route, so the sidebar always shows the space of what is on screen. Opening a task from a note link therefore shows the Tasks sidebar; Back to the note shows Notes again.

### D4. Notes leaves More; stored promotions stay readable

The `notes` entry leaves `moreEntriesOf` and `PROMOTABLE`. `readAppearance` already drops unknown ids on read and `setPromoted` keeps ids it does not know, so a stored `notes` promotion (written by 1.x before this change) is ignored by this client and kept in `sidebar_destinations`; `sidebar_order` keeps it too (`orderDestinations` ignores unknown ids). A 1.0 client never offered `notes` and drops it as unknown; a 1.x client before this change keeps showing its promoted Notes row. Nothing is migrated or rewritten, so there is nothing to converge.

Pinned notes leave the Tasks space's Favourites group (they are the Notes space's Pinned group). The favourites list itself is unchanged, so other clients still show them where they did.

### D5. One line per note, on a row grid

A row is a 36 px line (48 px on touch) on a grid of fixed tracks: the kind icon (20 px), the title (the rest), where it lives (10 rem, project dot and name; Inbox for a task note without a project; empty for a standalone note without a project), the labels (8 rem, `LabelChips` with at most two chips then "+n", the task row's chip style) and the time (5 rem, right-aligned, tabular). Below 40 rem of row width the labels track drops, and below 30 rem the place track narrows to 6 rem; the title keeps the rest. The menu stays at the row's end, revealed on hover or focus. The preview line goes; while words are searched, the snippet follows the title on the same line in the muted tone, its matches highlighted, so a search result is still one line. The completed and archived marks become the place's tooltip and a faint word after the title.

### D6. Search tokens replace the filters

The search field holds words and tokens. A token is committed as a chip (`ui/Chips` look: neutral chip with a remove button) when it is complete and followed by a space, when it is picked from the suggestions, or when it is pasted; Backspace in the empty text removes the last chip; every chip has a remove button. Words stay text and search as today (`noteSearch`: every word, accents and case ignored, phrases in quotes).

| Token | Meaning |
| --- | --- |
| `in:<project>`, `#<project>` | The note lives in that project or one of its sub-projects: a standalone note's project, a task note's task's project, a project note's own project |
| `@<label>`, `label:<label>` | The note carries the label: a standalone note's or a task's labels (project notes have none) |
| `kind:note`, `kind:task`, `kind:project` | Standalone notes, task notes, project notes (`notes`, `standalone`, `tasks`, `projects` read the same) |
| `linked:<note>` | Notes and items linked with that standalone note in either direction (its links and its Linked references) |
| `orphan` (`unlinked`) | Standalone notes nothing links to (the former Unlinked source) |
| `pinned` | Pinned standalone notes |
| `changed:<7d`, `changed:>30d` | Changed less or more than that long ago (`d`, `w`, `m` for days, weeks, months) |
| `changed:today`, `changed:yesterday`, `changed:2026-11-01`, `changed:<2026-11-01`, `changed:>2026-11-01` | Changed on, before or after that day, in the viewer's day |

Names are matched ignoring case and accents and may be quoted (`in:"Side projects"`). A chip stores the id of what it names and shows its current name, so a rename keeps the chip; a chip whose project, label or note was deleted reads as its name struck out and matches nothing. Tokens combine with AND; two tokens of the same key combine with OR (`@home @errand` lists notes with either). Negation, parentheses and OR across keys are left out: the task filter's full grammar is for saved views, and the Notes search is a narrowing field. Workspaces: the space is the current workspace's notes (the workspace control above the switch picks it); `in:` names projects only.

`#` and `@` follow the task filter (`#project`, `@label`); `label:` and `in:` are the spelled-out forms.

Suggestions: after `in:`, `#`, `@`, `label:`, `kind:`, `linked:` and `changed:` the matching values open under the field through `useCombobox` and `ComboboxList` (projects with their path, labels with their colour, notes by title, the kinds, a few date forms); the arrows move, Enter or Tab picks, Escape closes the list. While a word of two or more letters is the start of a key (`kin`, `lab`, `lin`, `pin`, `orp`, `cha`), the key is offered and Tab completes it; Enter keeps its list meaning, so typing `pin` and Enter still opens the first result. The suggestions are shown in the same popover on a phone, above the keyboard.

Defaults: with no words and no chip, Pinned and Recent show as before. A new note from the search field takes the `in:` project (the first one, when the user may write there) and the labels of `@` chips, as the Project and Label filters did.

The stored filters (`opentodo.notes.filters`) are converted once into chips (`kind:`, `orphan`, `in:`, `@`) and the chips are remembered on the device under `opentodo.notes.tokens`, like the filters were; the words are not. The old key is left as it is, so a device that runs an earlier version again reads its filters.

Alternatives: keeping the pickers beside the field (rejected: a second set of controls for the same thing, and the phone needed a sheet for them); the task filter's parser as is (rejected: its grammar has no note kinds, links or change times, and its `&`/`|` syntax is more than a narrowing field needs); tokens on the server too (D8).

### D7. The header stays small, with a slot for the graph toggle

`NotesHeader` renders the `PageHeader` with the title, the lead line (the note count), New note and Help, and the search field as its second row. It takes a `view` slot (`viewSwitch?: ReactNode`), rendered among the header's actions, documented as the place for the List | Graph toggle of `notes-graph-page`; this change passes nothing. The Notes sidebar has the same kind of slot after All notes for the Graph row (`// notes-graph-page: the Graph row goes here`). Until the sibling change lands there is no Graph row, rather than a row that opens the list: a row that does nothing new is noise.

### D8. Tokens are client-only

`ot notes search`, MCP `search_notes` and the note agent tools search words through `internal/notesearch` and already take `project_id` and label parameters of their own; a token string would be a second way to pass the same thing, and `linked:` and `orphan` need the link index, which the server does not keep (note-links D1). The word matching, ranking and snippets are unchanged, so the shared vectors (`internal/notesearch/testdata/vectors.json`) stay as they are. The tokens live in `web/src/lib/noteQuery.ts` with unit tests, loaded with the Notes chunk.

### D9. Notes already carry a project and labels

The standalone note editor (`NoteEditor.tsx`) already sets the project (`ProjectPickerField`) and the labels (`Combobox` of labels, with create) under the note, written as ops (`setNoteProject`, `toggleNoteLabel`), offline. Nothing is added there; the list now shows the labels (D5) and the search reaches both (D6).

### D10. Keys

`g e` stays Notes (registry `go.notes`, since notes-overview). The request named `g n`, which is Anytime's since 1.0 (`go.anytime`); moving it would break a learned key and every older guide, so it stays. Because the space follows the route (D3), `g e` shows the Notes sidebar and every task `g` key shows the Tasks sidebar without a new binding. The cheat sheet's Go section names it: "Go to Notes (the sidebar shows your notes)". No new key.

## Interface budget

- Rows of chrome above the first note: two, as before: the compact header and the search row (now the only control of that row, the pickers gone). The chips are inside the field.
- Primary sidebar destinations: Tasks space unchanged (at most six); the Notes space has one (All notes; two with the sibling's Graph). The switch is not a destination, like the workspace control.
- Scroll regions: three (sidebar, content, panel). The Notes sidebar's groups scroll in the sidebar's one scroller.
- Task properties: unchanged. A note row shows at most five things (kind, title, place, labels, time).
- Shortcuts: none added; `g e` keeps its registry row.

## Data model

No op change. The space is device state (`ot.sidebar.space`), the chips device state (`opentodo.notes.tokens`), neither synced. `user_prefs.sidebar_destinations`, `sidebar_order` and `favourites` are read as before and never rewritten by this change. Notes' `project_id` and `labels` exist in `internal/sync/ops.go`.

## Size and performance

The switch, the space store and the route map are in the entry chunk (they decide what the sidebar draws before anything loads): about 0.5 KB gzip, partly offset by the More entry and the promotable id that leave. The Notes sidebar, `noteQuery.ts` and the search field are in the Notes chunk or their own lazy chunk. Matching tokens is one pass over the entries before the word search (sets of ids built once per chip change), so the `notes-page` and `notes-search` budgets of the notes fixture (`docs/performance.md`) hold; a unit test runs the tokens over 2,500 entries and checks the pass stays linear (a count check of the matcher's calls). Memory: one set of ids per chip.

## Risks

- People who promoted Notes lose that row: the switch takes its place, one click away as before.
- `pinned` and `orphan` as bare words commit a chip after a space; searching the word itself needs quotes (`"pinned"`). Accepted: these words rarely matter in note text, and the chip is removed with one key.
