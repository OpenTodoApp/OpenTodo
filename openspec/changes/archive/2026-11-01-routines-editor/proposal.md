# Routines: sentence-card editor, run history and the Inbox card

## Why

`routines-engine` gives a rule a list of typed steps, manual runs, a dry run, per-step run records and Undo. None of it has a screen: the rule dialog (`web/src/app/RuleEditor.tsx`, `web/src/app/rules/RuleDialog.tsx`) is built for one trigger, one condition and one set of actions, and the run history (`RuleHistory.tsx`) is a flat list of tasks. The owner's decisions (DECISIONS.md, "Routines", 2026-10-31) describe the screen: sentence cards stacked vertically, phone first; tappable words that open pickers; data passed as chips; a live preview on every card; errors on the step with a one-tap fix; a search-first "Add step"; a History tab and an all-runs page; and an Inbox card "Routines since your last visit" with a synced seen marker, so a routine that ran at night is noticed in the morning without a stream of notifications.

## What Changes

- **Routines page** (`/routines`, `/rules` redirects): the Rules page renamed, with each routine's trigger, its steps as one sentence ("When a task gets the label waiting → count waiting tasks → if more than 10, notify me"), last run, a **Run now** button, and the existing switch, menu, pause-all and offline behaviour. A **Runs** tab lists all runs.
- **The editor** replaces the rule dialog for routines (a page on a phone, a wide dialog on a computer):
  - one **card per step**, read as a sentence ("Split **the note text** into lines", "Create tasks **from the lines** in **Errands**"); every bold word is a button that opens the right picker: the Combobox for projects, sections, labels, views, tasks and webhooks; date, number and text fields for literals;
  - **output chips**: each card ends with its output ("→ 3 lines"), and pickers for an input offer the outputs of earlier steps of a fitting type as chips;
  - **If/Otherwise** and **Repeat for each** show their blocks indented under them;
  - a **live preview** on each card from the dry run: computed on the device for text, lists, logic and Change tasks (offline included), from `POST /api/v1/rules/test` for the rest, debounced; previews never write;
  - **type errors** on the card with a one-tap fix ("Notify expects Text, got Tasks · Insert Format text");
  - **"+ Add step"** is search-first: a search field over the catalogue (names, synonyms, in six languages), with suggestions for the current output type first; unavailable steps are hidden from browsing and shown in search results with their hint ("Set up email to use this");
  - steps that became unavailable are marked "Not available: <reason>" with a link to the setting;
  - **Test** runs the routine as a logged test run and shows it step by step; Save works offline.
- **Run history:** a History tab per routine and the all-runs page, each run with its trigger, who it ran as, test or real, outcome, and step by step: status, duration, count, the items it touched as links (titles from local data), the error and its fix, and **Undo run**.
- **Inbox card "Routines since your last visit"**: runs after a synced per-user seen marker (`user_prefs.routines_seen_at`, a server run time, never smaller than the stored one, last-writer-wins like `feed_seen_at`), grouped per routine. Failures and waiting proposals (`routines-ai-step`) stay until handled; successes stay until seen or dismissed; the user's own manual and test runs are never shown; shared routines show only runs touching what the member can see (`routines-shared`). A setting **Hide successful runs** (`user_prefs.routines_hide_successes`). Failures and proposals also ring the bell (notification kinds `routine_failed` and `routine_proposal`), and reach delivery channels through the `routine` event when the user turned it on.
- **Retention:** a failed run is kept until it is seen (at most 90 days).
- Accessibility (every card and word is a labelled button, live preview announced politely, all reachable by keyboard), editor shortcuts in the registry, strings in the six languages, the editor and runs pages loaded lazily.

Not **BREAKING**: two additive `user_prefs` fields and two notification kinds; no new route except what `routines-engine` adds; no new environment variable.

## Out of scope

- Fetch-URL and RSS steps (AGENTS.md rule 5; no such step exists to edit).
- A visual flow-chart editor, drag-and-drop between blocks on a phone (Move up and down instead), copying steps between routines.
- Starters and "Describe it" (`routines-starters`), the Ask AI card and proposals' content (`routines-ai-step`), the project's routines tab (`routines-shared`).
- Push notifications for successes (the Inbox card is the quiet place for them).

## Roadmap

Advances milestone **1.1 "Routines"**, item `routines-editor`, second of five. **Depends on** `routines-engine`. GitHub issue: [#659](https://github.com/OpenTodoApp/OpenTodo/issues/659).

## Capabilities

### New Capabilities

- `routine-inbox`: the Inbox card, the seen marker, what appears and how long it stays, the bell notifications, the setting to hide successes, retention until seen.

### Modified Capabilities

- `routines` (new with `routines-engine`): ADDED "Sentence-card editor", "Pickers and output chips", "Live preview per step", "Type errors with fixes", "Add step", "Unavailable steps in the editor", "Test and save", "Routine history and all runs", "Editor keyboard and accessibility".
- `automation-rules`: MODIFIED "Rules page" (Routines page, Run now, Runs tab), "Rule editor" (one-card routines keep the rule form inside the new editor), "Rule notifications" (failure and proposal kinds).

## Impact

- **Op schema:** `user_prefs.routines_seen_at` (number) and `user_prefs.routines_hide_successes` (string `on`), additive; regenerated `opSchema.ts` and the contract fixture.
- **Server:** `internal/notify` (kinds `routine_failed`, `routine_proposal`), `internal/rules` (retention reads the seen marker), `internal/channels` (the `routine` event carries failures).
- **Web:** `web/src/app/routines/` (page, editor, cards, pickers, Add step, history, run detail, Inbox card), `web/src/lib/rules/` (sentence rendering, fixes, catalogue cache), the Inbox, Settings → Notifications, `web/src/lib/shortcuts.ts`, six catalogs, stories. `web/src/app/rules/` is replaced; `RuleFields.tsx` is reused inside the Change tasks card.
- **Size:** no new dependency. The editor and runs pages are a lazy chunk (estimated 22 KB gzip); the Inbox card loads with the Inbox's chunk only when the user has routines (about 2 KB gzip); first-load growth about 0.5 KB (the route and the two preferences).
