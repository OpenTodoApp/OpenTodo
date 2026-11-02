# No dialogs in the routine editor

## Why

The owner's feedback on the routine editor (`/routines/<id>`), 2026-11-02: "to add a step it opens a modal" and "if I click on 'Only when I run it' it opens a modal on the left". The standing decision (DECISIONS.md, "Routines UX: selectors not modals") is that the routine editor has no centred or detached modals: choices open next to what was pressed, bigger editors open inside the card from 1024 px or as a bottom sheet on phones only. The earlier polish (#730, #737, #742) moved the word pickers to anchored lists but left three surfaces behind:

- **+ Add step** opened the step catalogue as a dialog over the page (a centred sheet with a scrim on a computer).
- **The trigger word** opened a form (a select, the schedule's fields, Done) in a popover aligned to the word's end edge, so it hung off the word's left over the sidebar.
- **The When card's condition** opened its rows the same way.

An audit of every overlay on the routines screens (screenshots at 1280 × 800 and 390 × 844) found three more that are not destructive confirmations or a separate large task: deleting a step asked in an inline confirmation, testing a routine with AI steps asked in a centred confirmation dialog, and **Describe it** on the Routines page opened a dialog sheet for one text field.

## What Changes

- **Add step in place.** "+ Add step" expands the step catalogue right there: under the button at the end of the steps, inside a Then, Otherwise or Repeat block under that block's button, or between two cards for "Add step below" (card menu, or `a` on a focused card). It is the same searchable list the word pickers use (search focused, grouped Suggested and catalogue groups, arrow keys, Enter), unavailable steps dimmed under the search results; Escape, its close button or the same "+ Add step" collapses it and focus returns to what opened it. The chosen step is inserted at that place and gets focus. The button says `aria-expanded` and `aria-controls`.
- **The trigger as a word.** The trigger word opens the trigger kinds in the anchored word list, at the word's start edge (a bottom sheet below 640 px, like every word). Choosing a kind with members (a schedule's time and days, a label, a project and section), or choosing the current one again, opens those members inside the When card with Done; focus moves into them and back to the word on Done or Escape.
- **The When card's condition** opens inside the card from 1024 px and as a bottom sheet below, like Find tasks' condition.
- **Delete step without asking.** Delete step (menu or the Delete key) removes the step at once and shows a toast with Undo, which puts it back in its place; focus moves to a neighbouring card. Ctrl+Z keeps working.
- **Test with AI asks in the Test panel**, not in a dialog: the provider and token estimate with Test and Cancel.
- **Describe it expands on the Routines page** under the header instead of opening a dialog sheet; the button toggles it with `aria-expanded`.

Unchanged, on purpose: the leave guard ("Discard your changes?") stays a confirmation dialog (it guards against losing work); deleting a whole routine from the Routines page keeps its confirmation (it stops a server-side automation and has no Undo); the step card's "…" menu, the New routine Where menu and the row menu stay anchored menus; the AI proposal review and a deleted routine's run detail stay dialogs (a separate, larger task).

Not **BREAKING**: no op, route, field or environment variable changes.

Out of scope: the rule-based board and view conversions, the shared routines' Where menu, the starters (already anchored lists), and the task-level undo log (a deleted step is a draft edit, undone in the editor).

ROADMAP: follows the routines series (`routines-editor-polish`, owner feedback of 2026-11-02); no new roadmap row.

## Capabilities

### Modified Capabilities

- `routines`: "Add step" (in place instead of a sheet) and a new requirement "No dialogs in the routine editor" (trigger, When condition, deleting a step, AI test question, Describe it).
