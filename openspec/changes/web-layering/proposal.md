# Proposal

## Why

An audit of the web client (UI-12, UI-13, DATA-8) found that its layers leak into each other:

- **UI-12**: primitives in `web/src/ui` (ConfirmDialog, AskComposer, PageHeader, the Combobox) imported the overlay module from `web/src/app/overlay`, which itself imports `web/src/ui`: a circular dependency, so the design system could not be built, tested or shown in the workbench without the screens. PageHeader also reached into `app/help/store`.
- **UI-13**: about sixty files in `web/src/app` opened IndexedDB themselves (some ninety inline live queries), against AGENTS.md ("data access only via `src/lib`"). Each screen wrote its own filter, so the rules diverged: the sidebar, quick add sheet, Vim layer and import screen left archived projects out of the list they read, while the views' quick add, share capture, pickers and filters kept them in, and the same project list was read by a dozen separate queries on every write.
- **DATA-8**: the entity-to-table mapping was copied five times (`sharing.ts`, `ops.ts`, `undo.ts`, `e2eeSync.ts`, `sync.ts`) and the copies diverged. `client-data-safety` replaced them with one registry (`tableOf`/`syncedTables` in `db.ts`); nothing yet fails when a new entity kind is added without a table, or when a module grows its own mapping again, and `undo.ts` still re-exported the registry as if it were its own.

## What Changes

- The overlay module moves to `web/src/ui/overlay` and is exported by the `web/src/ui` barrel; the help request store moves to `web/src/lib/helpRequest.ts`. Screens import overlays from the barrel. A thin `web/src/app/overlay` re-export stays only for the four screens a parallel change (`web-component-structure`) is splitting.
- ESLint (`eslint.config.js`, already part of `make check`) refuses any import of `src/app` inside `src/ui`, and in `src/app` any import of `lib/db` (except the sign-out and storage-persistence lifecycle calls) and any use of the `db` object. Tests, test kits, stories and the four files of `web-component-structure` (marked "cleared by web-component-structure") are exempt.
- Screens read local data through `web/src/lib/localData.ts`: shared live snapshots of projects, labels, memberships, views, the user preferences and review rows, and field definitions (one Dexie live query each, like the task snapshot of `large-list-performance`), plus hooks for per-task and per-project reads. `lib/liveSnapshot.ts` is the generic shared snapshot; `lib/liveTasks.ts` uses it.
- One visibility rule for projects: screens get live projects (not deleted, archived included); browsing lists narrow them with `visibleProjects`; pickers and quick-add parsing leave archived projects out themselves, as their specs say; only the Trash, history and statistics read deleted projects.
- A test pins the entity table registry against the server's schema fixture (every entity kind has its own table of the current database, no fallback, and no other module in `src/lib` maps entity kinds to tables).

No op schema, API or data model change; no new dependency or environment variable. Not **BREAKING**.

User-visible effect: the quick add sheet matches the views' quick add (archived projects behave the same in both); everything else reads the same data as before.

**Out of scope**: the four screens `web-component-structure` is splitting (TaskListView, Properties, CalendarView, AssistantPanel) and their queries; writes (already through `lib/ops`); the `dexie` live-query helper `useLiveQuery` itself, which screens may still use over `src/lib` functions. ROADMAP.md item advanced: none; this is maintainability of existing behaviour.
