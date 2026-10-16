# Proposal

## Why

The website's inbox-zero and GTD guides (`OpenTodoWebsite/src/content/guides/inbox-zero-for-tasks.md`, `getting-things-done.md`) tell people to empty the Inbox once a day with one decision per task: do it, date it, file it, delegate it, park it or delete it. The app has every one of those actions, but spread over the list keys (`c`, `s`, `Shift+A`, `L`, Delete), the detail panel's project picker and a `g i` round trip, and the list never says how far along you are. Processing twenty captured tasks means twenty rounds of select, open, change, close. A focused mode that shows one task with its notes and takes a single key per decision turns the guides into a flow the app carries itself.

## What Changes

- **A triage mode for the Inbox.** `g` then `p` ("process"), a **Process** button in the Inbox header, or the Vim command `:triage` open a full-width screen showing one Inbox task at a time: its title, notes (read-only, the same rendering as the detail panel), due date, labels and reminders, with a progress line "4 of 17" and a bar of decisions, each a button with its key.
- **Single-key decisions that advance to the next task:** `t` Today (due today), `c` Complete, `s` Schedule (the date field with its calendar popover, Enter applies), `m` Move (the project picker; a move into a shared project goes through the existing cross-scope move), `a` Delegate (a picker of the people in the projects you share, each with their project; choosing moves the task there and assigns it in one batch), Delete Trash (restorable from the Trash). `l` Labels opens the label picker and stays on the task, because a context label completes a decision rather than replacing it. `j` or Space skips, `k` goes back, Enter opens the full detail panel over the card, Escape returns to the Inbox with the current task selected.
- **Someday waits for its field.** The GTD guide's "move it to someday" needs the `start` field of the sibling change `someday-and-evening`. The decision (`y` Someday) is specified here but is absent from the bar, the key map and the help until that field exists; no label-based substitute is introduced, so the user never learns a flow that changes later.
- **Progress and queue.** The queue is the Inbox's open top-level tasks in their manual order when the mode opens; tasks captured meanwhile join the end, tasks that leave the Inbox from another device drop out. Each decision or skip advances; the count reads "n of N" with N growing only when tasks arrive. An empty Inbox shows an "Inbox zero" state with the way back.
- **Nothing new is stored.** Every decision is one of the operations the list and the detail panel already write (`due`, `completed_at`, `project_id`, `assignee_id`, `labels`, `deleted_at`), applied locally first, queued offline, converging by last-writer-wins. No new entity, field, route, setting or environment variable.
- **Keyboard first, screen readers, touch.** The mode owns the keyboard like the Trash and calendar views do; shortcuts never fire while a picker or field has focus. A live region announces each task ("4 of 17: Call the plumber") and each outcome ("Scheduled for Fri 16 Oct", "Moved to Work"). The decision bar wraps into labelled buttons at 360 px so the flow works by touch.
- **Vim keybindings** keep their meanings inside the mode: `j`/`k`, `x` completes, `dd` trashes, `:triage` enters, `:q` leaves.
- **Docs and help.** `docs/views.md` gains a "Process the Inbox" section, the keyboard guide and the `?` overlay list the new keys (regenerated from `shortcuts.ts`), and the screen gets a help id.

Out of scope:
- Undo of a decision. `k` returns to the previous task and every decision is reversible by hand; the one-step undo toast is being built by `bulk-edit` (its generalised undo store), and whichever change lands second wires triage decisions into it.
- Triage of other views (Today, a project), a "two-minute timer", and estimates (`e` stays a list key).
- Changing the Inbox list itself, its order or its header beyond one button.
- The website guides; they live in another repository and may link the mode once it is released.

ROADMAP: this advances row 17 of "Next: Parity and depth", "Inbox triage" (`inbox-triage`). Refinements of the row's notes: the chord is `g` `p` rather than `g` `t`, because `g` `t` has been Today since `bootstrap-core-platform` (`web/src/app/Shell.tsx:122`, `docs/keyboard.md`); "do now" is `t` for Today rather than `d`, because the Vim layer reserves `d` for `dd`; Someday is deferred to `someday-and-evening` as described above; Complete and Labels are added as decisions because the inbox-zero guide's first rule is "do it if it takes two minutes" and the GTD guide files a task with a context label.

Depends on: nothing. Coordination: `someday-and-evening` (the Someday decision appears when its `start` field lands), `bulk-edit` (undo store), `search-and-command-palette` (registers "Process the Inbox" as a command).

Nothing here is **BREAKING**: no op field, no API route, no environment variable, no Dexie version.

## Capabilities

### New Capabilities
- `inbox-triage`: the focused mode that walks the Inbox one task at a time: how it is entered and left, the queue and progress, the single-key decisions and their pickers, the deferred Someday decision, its offline and convergence behaviour, announcements and touch, and its Vim bindings.

### Modified Capabilities
- `web-app`: "Keyboard navigation" gains `g` then `p` for the triage mode; "Command line" gains `triage`.

## Impact

- **Web:**
  - new `web/src/app/TriageView.tsx` (card, progress, decision bar, pickers) and a pure `web/src/lib/triage.ts` (queue, progress and announcement text, unit-tested without React)
  - `web/src/app/router.ts` (`{ view: 'triage' }` at `/triage`), `web/src/app/Shell.tsx` (`g` `p`, route rendering), `web/src/app/TaskListView.tsx` (the Process button in the Inbox header)
  - reused as they are: `datetime/DateField.tsx`, `ProjectPickerField.tsx`, `LabelPicker.tsx`, `NotesEditor.tsx` (`readOnly`), `lib/sharing.ts` `membershipMap`/`assigneeOptions`, `lib/ops.ts` `updateTask`, `moveTaskAcrossScopes`, `setTaskCompleted`, `deleteTask`
  - `web/src/app/vim/commands.ts` (`triage`), `vim/help.ts`, `web/src/lib/shortcuts.ts` (new rows, regenerated into `docs/keyboard.md` and the `?` overlay)
- **Server, API, data:** unchanged. No new route, nothing for the demo deny list, no schema entry.
- **Docs:** `docs/views.md`, `docs/keyboard.md` (generated), the help bundle (`make docs`), `CHANGELOG.md`.
- **Size:** no dependency; a few KB of client code, lazy-loaded with the view. Server binary, image and memory unchanged.
