# Proposal

## Why

User feedback, October 2026:

1. **"I don't understand how to add a label or project via the text I insert in a task. I tried with # and @ but didn't work."** The parser does recognise `#project` and `@label` (`natural-language-capture` "Attribute tokens"), but only an existing project's exact name or unique prefix, written without spaces. Typing `#` shows nothing: no list of projects, no hint that a name is expected. A `#token` that matches nothing stays in the title silently (by spec), so from the user's side "it didn't work" and there is no way to tell why. Projects with spaces in their names ("Home renovation") have to be typed as `#homerenovation`, which nobody guesses.
2. **"The smart interpretation of the task title works only the first time I insert a task, not when I am editing."** Parsing runs only in quick add. The panel's title field, and soon the inline title editor (`inline-task-editing`), are plain text. Typing `tomorrow p1 #work` into an existing task's title saves those words in the title.

## What Changes

- **Suggestions as you type a token.** In every field that parses (quick add everywhere, the panel title, the inline title editor), typing `#` opens a suggestion list of projects under the caret, and `@` opens one of labels, both filtered by what follows. They match on any word of the name, ignoring case, accents and spaces, and nested projects show their path. Arrow keys move, Enter or Tab picks, Esc closes the list and keeps the text, and the mouse can pick too. Picking writes a token the parser resolves to that exact item and shows its chip at once. The list ends with "Create project “x”" or "Create label “x”" when no item has that exact name. Creating a project from there makes a top-level personal project through the op log, with the same defaults as the sidebar's New project, and it works offline.
- **A token that matches nothing says so.** When the caret leaves a `#token` that resolves to no project (ambiguous or unknown), a muted chip reads "No project “hom” · stays in the title" (or "2 projects match “hom”"), so the outcome is visible before saving. The chip can be activated to open the suggestions for that token. Unknown `@labels` keep today's behaviour: they become a new label, now shown on the chip as "New label “x”".
- **Parsing while editing a title.** The panel title field and the inline title editor parse the text typed in this edit, with the same chips, dismissal and quotes as quick add. On commit, recognised attributes are applied to the task (due, deadline, start, evening, priority, estimate, recurrence, reminders, project, labels added to the existing ones), and their tokens leave the title. Text that was already in the title before the edit is never parsed again, so a title that says "Review may report" never gains a date on a later edit. Viewers' fields do not parse. The per-device parsing switch turns this off too.
- **Help and the cheat sheet** gain one line each: "Type # for a project, @ for a label, then pick from the list".

No op schema change: every attribute is written through existing fields and `mutate()`. A created project or label uses the existing creation ops. No new route, dependency or environment variable. Not **BREAKING**.

**Out of scope**: sections as tokens (`/section`), assignees as tokens (`+name`), parsing in the notes or comments, and changing the parser's grammar or the six bundled vocabularies. ROADMAP.md item advanced: natural-language capture (`nlp-quick-add`), extending it from capture to editing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `natural-language-capture`: new requirements "Token suggestions", "Unmatched tokens are explained" and "Parsing while editing a title". "Per-device parsing toggle" is modified to cover the title editors. The panel title keeps the behaviour of `web-app` "Title draft survives remote changes".

## Impact

- **Code**: `web/src/lib/nlp/attributes.ts` (match on any word for suggestions, a resolver that accepts the picked token form), a pure `web/src/lib/nlp/suggest.ts` (`tokenAtCaret`, `projectSuggestions`, `labelSuggestions`), `web/src/lib/nlp/edit.ts` (`parseEdit(base, draft)`: parses only spans not present in `base`, and `applyParsed(task, result)` builds the update), `web/src/app/QuickAdd.tsx` (the suggestion list through the `Combobox` listbox pattern, the unmatched chip), a shared `web/src/app/TitleField.tsx` used by the panel header and the inline editor, `web/src/app/task-detail/TaskDetail.tsx`, stories `Capture/Quick add` (suggestions open, unmatched chip) and `Task/Panel` (title with chips), and the docs `docs/quick-add.md`, the Help page "Quick add" and `docs/task-panel.md`.
- **Server and API**: none.
- **Dependencies**: none. Expected +2 KB gzipped in the entry chunk (suggestion logic and `TitleField`).
- **Interface budget**: no chrome row above lists. The suggestion list is an overlay, chips sit where quick add's chips already sit, and the panel title's chips show only while editing. No new shortcut: Tab, Enter and Esc are local to the open list.
