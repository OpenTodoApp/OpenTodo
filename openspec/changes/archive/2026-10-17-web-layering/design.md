# Design

## D1: The overlay belongs to the design system

The overlay module (Dialog, Menu, Popover, ToastRegion, positioning and the overlay stack) depends only on `src/ui` primitives and `src/lib/i18n`, and the Combobox, ConfirmDialog, AskComposer and PageHeader need it, so it moves to `src/ui/overlay` and the barrel exports it (`barrel.test.ts` already requires screens to import shared UI from the barrel). The help request store is a tiny external store with no UI; it moves to `src/lib/helpRequest.ts` so PageHeader can open help without importing a screen. `src/app/overlay/{index,Menu,stack,useOverlay}.ts` re-export from the barrel only for the four files `web-component-structure` owns; that change deletes them when it switches those imports.

## D2: Shared snapshots, one module

`lib/liveSnapshot.ts` generalises the task snapshot of `large-list-performance` (D2): one Dexie live query per kind of data while anything subscribes, restarted when tests swap the database, frozen under test so an in-place edit of shared data fails loudly. `lib/localData.ts` builds the screen-facing hooks on it: whole-table snapshots for the small, widely read tables (projects, labels, memberships, views, user preferences, review, field definitions) with per-snapshot derived lists (`derived`), and `useLiveQuery`-based hooks for reads keyed by a task or project (one task, subtasks, sections, reminders, comments, attachments). One module keeps the surface small and the lint rule simple (`lib/db` is not importable from `src/app`), and fewer queries run per write: the project list alone was read by a dozen components.

## D3: One visibility rule

| List | Deleted | Archived | Used by |
|---|---|---|---|
| `useProjects()` | out | in | default: names, colours, pickers, parsing, views |
| `visibleProjects(useProjects())` | out | out | sidebar tree, Vim `:project`, import target |
| `useAllProjects()` | in | in | Trash, history, statistics, activity names |

Pickers (entity-pickers "Project pickers") and quick-add parsing (natural-language-capture) already leave archived projects out themselves, so feeding them live projects is correct and lets an archived current project show as "archived". The quick add sheet read non-archived projects only; it now gets the same list as the views' quick add.

## D4: Registry test

`entityTables.test.ts` takes the entity kinds from `internal/sync/testdata/schema_fixture.json` (the server's schema, checked against `sync.Schema` by Go tests), so a new kind on the server without a client table fails, and scans `src/lib` (except `db.ts`) for hand-written `kind: db.table` maps and `case 'kind': return db.table` switches.

## Impact

No data model change, no new fields, no new dependency (ESLint is already a dev dependency). Bundle size: about the same (queries move, one small module is added). Runtime memory: a few shared arrays replace per-component query results. Interface budget (docs/interface-guide.md): no screen changes layout, chrome, properties, scroll regions or shortcuts.
