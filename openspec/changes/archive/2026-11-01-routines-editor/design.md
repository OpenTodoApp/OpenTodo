# Design

## Context

- **Today's screens:** `web/src/app/rules/RulesView.tsx` (the `/rules` page: list, switch, menu, Pause all), `RuleDialog.tsx` and `RuleFields.tsx` (trigger chooser, condition rows, action controls, the "n open tasks match now" line), `RuleHistory.tsx` (runs from `GET /api/v1/rules/{id}/runs`), `web/src/app/RuleEditor.tsx` (the board rule editor whose action controls the dialog extends), `convertDraft.ts`. The page is in the sidebar's More group and the palette ("Go to Rules", "New rule").
- **From `routines-engine`:** `rule.steps`, the shared step table and type checker (`web/src/lib/rules/steps.ts`), the device planner for data and Change tasks steps, `POST /api/v1/rules/test` for drafts, `POST /api/v1/rules/{id}/run` with `test`, run and step records (`GET /api/v1/rules/{id}/runs/{run}`, `GET /api/v1/me/rules/runs`), undo, and `GET /api/v1/me/rules/catalogue` with availability.
- **Seen markers:** the activity feed's `project_prefs.feed_seen_at` (docs/sync.md): a time from the server's events, never written smaller, LWW per field, a per-device baseline for the first use. `user_prefs` is the one personal row (`entityId "me"`).
- **Notifications:** `internal/notify` kinds (`rule_fired`, `rule_paused`, …), the bell marker (`app-shell` "Notification bell marker"), delivery channels (`internal/channels`, events per channel).
- **UI rules:** primitives from `web/src/ui` (Combobox for entities, Button, Field, Switch, Card, Badge, Tabs, Menu items), `<Icon>` only, tokens from `web/src/index.css`, stories for shared pieces, the shortcut registry with a conflict test, the interface budget (docs/interface-guide.md).

## Decisions

**D1. One editor for every routine.** The editor opens for new and existing routines. A rule written before routines (one trigger, optional condition, `actions`) opens as a routine with a **When** card (trigger and condition), one **Change tasks** card holding today's action controls (`RuleFields.tsx` reused), and nothing else; saving it unchanged writes nothing, and saving it with one card keeps `actions` with `steps: null` (`routines-engine` D2), so older devices keep editing it. On a phone (< 640 px) the editor is a page (`/routines/<id>`), on a computer a dialog of the wide size with the same content; Back and Escape ask before discarding unsaved changes.

**D2. Sentence cards.** Each card is one sentence built from the catalogue entry's template in the user's language, with its inputs as **word buttons**:

- `When` card: "When **a task gets the label** **waiting**", "Every **Friday** at **17:00**", "Only when I run it"; its conditions follow as "if **in Work**" words, as rule conditions today.
- step cards: "Get the task **Groceries**" (an input that takes a reference only starts from a choice: a task inserts Get a task above it, a project Find a project, and "Find tasks…" a Find tasks step; such an output is named by its value, so the next card reads "Get the note text of **Groceries**"), "Split **the note text** into lines", "Create tasks from **the lines** in **Errands**", "If **the count** is **more than** **10**", "Notify me: **{count} groceries**".
- A word reads its value (a chip for a reference, the literal otherwise) or a placeholder in the accent colour ("**choose a project**"). Tapping it opens its picker in a popover on a computer and a bottom sheet on a phone.
- Under the sentence: the output line ("→ **3 lines**", the chip later steps can use) and the preview (D4). A card's menu (`⋯`): Move up, Move down, Duplicate, Delete. Outputs are named after their step kind, numbered when repeated ("the lines", "the lines (2)"); nothing is stored for the name, which keeps the op value small and translates with the language.
- Blocks: If shows "Then" and "Otherwise" lanes indented under it with their own "+ Add step"; Repeat shows "For each **task**" with its steps indented, and `item` offered as the chip "**each task**".
- Cards stack vertically in one column at every width; on a computer the column is at most 44 rem wide and the preview of the focused card may expand beside it from 1280 px.

**D3. Pickers and chips.** Each input kind has one picker:

| Input | Picker |
|---|---|
| project, section, label, view, task, webhook | the Combobox of `web/src/ui` (local data; tasks searchable by title) |
| text | a text field with an "Insert" menu of chips (outputs of type text, number, date, tasks as titles) and a character count |
| lines, tasks | a chip picker of earlier outputs of that type, plus "Find tasks…" which inserts a Find tasks step above |
| date | today, tomorrow, next week, in N days, a date picker, or a chip |
| number | a number field or a chip |
| condition | the rule condition rows of today's dialog, with their live count |
| filter query | the filter field with its parser errors, or a saved view |

The chip list offers only outputs of accepted types, nearest first, plus "the trigger's task" where it applies; outputs of the wrong type are listed below a divider as "Needs conversion" with the fix (D5).

**D4. Live preview per step.** After each change (debounced 400 ms) the editor plans the draft:

- on the device, with the shared planner, for text, lists, logic and Change tasks, from local data (offline, encrypted accounts included: the device decrypts);
- through `POST /api/v1/rules/test` for steps planned only on the server (tool-backed steps, time, templates), when online; offline those cards show "Preview needs a connection" and the later cards use a placeholder value of the right type.

A card's preview shows its output: up to 5 lines or task titles and "+ 12 more", a number, a date, or "Would create 3 tasks in Errands", "Would email you" (never sent). The trigger's sample: for an event trigger, the editor picks the most recent task that matches the condition (or asks "Preview with a task…"); for a schedule, the next firing. Previews never write and are not logged. A preview that would exceed a limit shows it on the card ("Would write 620 of 500").

**D5. Type errors and one-tap fixes.** The shared type checker runs on every change. A card with an error gets an error line in the danger token colour under its sentence and the word in error outlined; the editor's Save is still allowed (the routine is stored and runs fail at that step) only when the error is "unavailable"; a type error blocks Save with "Fix step 3 first". Fixes, offered as one button, come from a fixed table:

| Got → expected | Fix |
|---|---|
| Tasks → Text | Insert **Format text** (the tasks' titles, one per line; Join takes lines only) |
| Tasks → Number | Insert **Count** |
| Lines → Text | Insert **Join** |
| Text → Lines | Insert **Split into lines** |
| a reference to a removed step | Choose another value |
| Tasks to a single-task input | Wrap in **Repeat for each** |

Applying a fix is one undoable edit of the draft.

**D6. "+ Add step": search first.** A sheet with a search field focused, and under it:

1. **Suggested**: steps that accept the output type of the step above (after Split into lines: Create tasks, Filter, Count, Join, Sort, Take first), at most 6;
2. the catalogue's groups (Tasks, Projects, Notes and text, Lists and logic, Time and focus, Communication, AI), collapsed on a phone.

Search matches names, short descriptions and synonyms ("mail" finds Email me; "loop" finds Repeat for each; "rename" finds Update project) in the user's language and in English. Unavailable steps (catalogue `available: false`) are left out of Suggested and the groups, and appear in search results dimmed with their hint and a link ("Email me · Set up email to use this"). Choosing a step inserts it below the current card with its inputs pre-filled from the step above where the type fits.

**D7. Unavailable steps.** A saved routine with a step whose catalogue entry is now unavailable shows that card with a Badge "Not available: <reason>" and a link to the setting (the reasons of `routines-engine` D15, translated). The routine row on the Routines page shows "1 step not available". The catalogue is cached per device and refreshed after each sync; offline, the cache decides.

**D8. Test and Save.** **Test** saves nothing: it posts the draft as a test run (`run` with `test: true` for a saved routine; for an unsaved one the draft route) and opens the run detail of D9 under the editor's header. **Save** writes the routine as operations (offline-capable) and closes. **Run now** is in the saved routine's header and the page row.

**D9. History and runs.** The routine's History tab and the all-runs page (`/routines/runs`, the Runs tab of the page) list runs newest first: time, source (an icon and "Scheduled", "When a task got the label waiting", "You ran it", "An AI assistant ran it", "Test"), who it ran as, the outcome as a Badge (Done, Ended at step 4, Partial, Failed at step 3, Skipped, Waiting for a device, Proposal waiting), writes and duration. The all-runs page filters by routine, outcome and source, 50 at a time with Show more. A run opens its **detail**: the routine's cards as they were run, each with its status, duration, count, the items touched as links (titles resolved on the device; "Deleted task" by id), the error with its fix and a link to the setting, tokens when an AI step ran, and **Undo run** with the engine's answer ("10 restored, 1 kept…"). History and runs need a connection; offline the last fetched page is shown with "Updated 2 h ago".

**D10. The Inbox card.** At the top of the Inbox list (above the first task, inside the list's scroll region; never a new chrome row) a Card **"Routines since your last visit"**, shown only when it has entries:

- **Source:** `GET /api/v1/me/rules/runs?since=<routines_seen_at>&for=inbox`, fetched with the Inbox and after a sync wake-up that signals new runs; the server applies the rules below so every device agrees.
- **What appears:** runs after the marker of the user's enabled and disabled routines, except the user's own manual and test runs (sources `manual`, `test` started by this user); for shared routines (`routines-shared`) only runs whose touched items the member can see.
- **What stays:** failed runs and waiting proposals stay until handled (the run is undone or re-run successfully, the proposal applied, dismissed or expired), whatever the marker; successes stay until seen (the marker passes them) or dismissed.
- **Grouping:** one line per routine: "Groceries · 3 tasks created · Friday 17:00", "Morning sweep ran 5 times · 23 tasks moved", "Weekly digest failed · Not available: outgoing email is not set up", "Sort inbox · proposal waiting · Review". At most 5 lines, then "See all runs".
- **Seen:** the card counts as seen when it has been on screen for 2 seconds, or when the user presses **Mark as seen**; the device then writes `user_prefs.routines_seen_at` to the `at` of the newest displayed run (a server time). It never writes a smaller value than it holds; LWW keeps the later mark across devices. A device without a marker uses its first fetch's newest run as the baseline (stored per device), so existing history does not flood the card after the upgrade.
- **Dismiss** on a success line hides it on every device (`routines_seen_at` moves past it if it is the newest; otherwise a per-run dismissal is server state, `rule_runs.dismissed_at`).
- **Hide successful runs** (Settings → Notifications and the card's menu) is `user_prefs.routines_hide_successes = "on"`: success lines are never shown; failures and proposals still are.

**D11. Bell and channels.** Two notification kinds: `routine_failed` ("Weekly digest failed at step 3", opens the run) and `routine_proposal` ("Sort inbox has a proposal for you", opens the review; `routines-ai-step`). One notification per failing routine per day at most (later failures of the same day update its count), never for test runs or the user's own manual runs (they see the result at once). Both are listed and marked read through the notification routes. Delivery channels receive them under the `routine` event when the user switched it on for a channel. Successes never notify (only the existing `notify` action and Notify me step do).

**D12. Retention until seen.** The run log keeps a failed run until the user's marker has passed it and it is older than 30 days, at most 90 days; a run with a waiting proposal until the proposal is handled or expires. The server reads the marker from the materialised `user_prefs` row.

**D13. Keyboard and accessibility.**

- Every card is a `group` named by its sentence; every word button has an accessible name with its role ("Project: Errands, change"); the output and preview are described by the card; the preview region is `aria-live="polite"` and announces only on explicit Test, not on every keystroke.
- Shortcuts in the registry, scoped to the editor, with the conflict test: `Alt+↑` / `Alt+↓` move the focused card, `Ctrl+Enter` / `⌘+Enter` Save, `Ctrl+Shift+Enter` Test, `a` "Add step" below the focused card, `Delete` on a focused card asks to delete it, `Escape` closes a picker, then the editor. Arrow keys move between word buttons inside a card.
- Pickers are the Combobox's (labelled, typeahead, Escape). Touch targets 44 px; the editor never scrolls sideways at 360 px.
- No new global shortcut; Routines stays in More and the palette.

**D14. Languages.** Sentence templates, step names, synonyms, reasons, fixes and the card strings in the six catalogs (en, de, fr, it, es, pt); templates are whole sentences with named slots, so word order follows the language. `make i18n-check` covers them.

## Data model impact

- `user_prefs.routines_seen_at` (kNumber, default `0`, a server run time) and `user_prefs.routines_hide_successes` (kString, default `""`, `on` hides): additive, personal, LWW; clients never write a smaller `routines_seen_at`.
- Server: `rule_runs.dismissed_at` (additive column) for dismissals of single success lines and `rule_runs.seen_at` (additive column: when the server first found the marker past a failed run, so retention counts its 30 days from there); retention reads the marker. No op field renamed; no data migration.

## Size and memory

No new dependency. `web/src/app/routines/` is a lazy chunk (editor, cards, pickers, Add step, history, run detail; estimated 22 KB gzip); the Inbox card is a small lazy piece fetched only when the user has at least one routine (about 2 KB gzip). First load grows about 0.5 KB gzip (the route entry and the two preferences); `web/bundle-budget.json` is raised only if measured, with the reason. Server memory unchanged.

## Interface budget

- **Chrome rows:** Routines page: the tool head and the tabs row (Routines, Runs): 2. Editor: the header (name, Test, Save) and nothing else above the first card: 1. The Inbox card sits inside the list, not above it, so the Inbox keeps its rows.
- **Task properties:** unchanged (the card names tasks by title only).
- **Sidebar destinations:** none added; Routines replaces Rules in More.
- **Scroll regions:** the Routines page list, or the editor's card column plus a picker sheet: at most 2.
- **Shortcuts:** editor-scoped only, registered with the conflict test; no global key added.

## Open questions

- **Seen after 2 seconds.** Default chosen: the card counts as seen after 2 seconds on screen, like a read notification; the owner may want an explicit Mark as seen only.
- **One failure notification per routine per day.** Default chosen to keep the bell calm; the owner may want every failure.
- **No global shortcut for Routines.** Default chosen: none (palette and More); `g` letters are scarce.
