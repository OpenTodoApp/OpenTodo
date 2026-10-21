# Design

## Context

- `lib/nlp/parse.ts` parses a line into a `ParseResult` with `chips` (spans and kinds) and the cleaned `title`. `attributes.ts` resolves `#name` by folding (no case, accents or spaces), exact first, then a unique prefix, and returns null otherwise. `@name` is taken literally, and `toTaskInput` creates missing labels.
- `QuickAdd.tsx` renders the input and the chips, with dismissal (`dismissChip`, `rebaseDismissed`) and the Backspace highlight (`chipAtCaret`).
- The comment `Composer` already completes `@mentions` from the membership cache (`lib/comments.ts`: `mentionAt`, `mentionCandidates`), with a listbox under the textarea. `web/src/ui/Combobox` provides the listbox semantics used by the pickers.
- The panel title (`TaskDetail.tsx`) is an `<input>` with a draft that survives remote changes (`titleBase`), and it commits on blur or Enter through `updateTask`.

## Goals / Non-Goals

**Goals:** make `#` and `@` discoverable and predictable; let titles be edited with the same grammar as capture, without surprising re-interpretation of old text.

**Non-Goals:** new token kinds, a different grammar, parsing notes.

## Decisions

### D1. Suggestions: one helper, one listbox
`suggest.ts` exports `tokenAtCaret(value, caret)` → `{ kind: 'project' | 'label', start, end, query } | null` (a `#` or `@` at a word start, up to the caret, no whitespace in between, and not inside quotes). `projectSuggestions(query, projects)` ranks exact folded match, then prefix of the name, then prefix of any word, then prefix of the path, up to 8 items with the path for nested projects. `labelSuggestions` does the same for labels. The listbox reuses `useCombobox`'s keyboard model (`aria-activedescendant` on the input, `role="listbox"` anchored with `Popover` at the caret's line) so screen readers announce it like the pickers.

### D2. The picked token form
Picking inserts `#` plus the folded name with spaces removed and the original case kept (`#HomeRenovation`), which the resolver already matches exactly by folding. If two projects fold to the same string (same name under different parents), the insertion uses `#Parent/Child`. The resolver learns this `/` path form (folded per segment), which is also typed by hand. Labels insert `@` plus the label name with spaces replaced by `-`, and `findLabel` gains the same folding so the label resolves. Existing lines parse exactly as before: the path form is new syntax that previously stayed literal.

### D3. Creating from the list
"Create project “x”" calls the sidebar's `createProject({ name })` (top-level, personal, the palette's next colour) and inserts its token. "Create label “x”" inserts the token only, since `toTaskInput` creates the label on save as today. Both work offline because they are ops.

### D4. Unmatched chip
`parse` already knows when a `#token` failed. It now returns it as a chip of kind `unmatched-project` with a reason (`none` or `ambiguous`, with the count). `QuickAdd` renders it muted with the reason, and it is not an attribute, so `toTaskInput` ignores it. Activating it opens the suggestion list for that span.

### D5. Parsing an edit, not the title
`parseEdit(base, draft, ctx)` diffs `base` (the stored title when the edit started) against `draft` with a simple common-prefix/common-suffix diff, which is enough for typing, and marks the inserted span. Text outside the inserted span is treated as quoted, using the dismissal mechanism with every pre-existing span pre-dismissed, so old text never yields a chip. On commit, `applyParsed(task, result)` builds one `updateTask` patch: scalar fields (due, deadline, start, evening, priority, estimate, recurrence, project) overwrite, labels union with the task's, and reminders are added through the reminders helper in the same op batch. The title becomes `result.title` (tokens removed). If the task is recurring and the edit sets a due date, the series rules of `recurring-tasks` apply, as with any due edit.

### D6. One `TitleField`
The panel header and the inline editor share `TitleField`: the input, the chips under it while focused and only when there are chips, the suggestion list, Enter to commit, Esc to cancel (inline editor) or revert (panel), and the remote-change rule of "Title draft survives remote changes". Quick add keeps its own component, sharing the hooks (`useTokenSuggestions`, `useParsePreview`).

## Data model

None. Updates use existing fields. A created project uses the existing project creation op, and labels use the existing label creation.

## Size and resources

About +2 KB gzipped in the entry chunk. No dependency. Parsing on every keystroke in the title is the same cost as quick add (well under 1 ms for a line).

## Interface budget

No chrome above lists. Chips appear under the panel title only while it is being edited and has chips, so the panel at rest is unchanged. The suggestion list is an overlay. No shortcut is added.

## Risks / Trade-offs

- [A title edit moves the task to another project unexpectedly] → only a `#token` typed in this edit can do it, its chip shows the project before commit, and Undo in the toast reverts the whole patch.
- [The diff misattributes a paste into the middle of the title] → the inserted span is the pasted text, which is what the user just added. That is the intended input.
- [Path tokens collide with titles containing `#a/b`] → only when `a` and `b` resolve to a real parent and child. Otherwise the text stays literal, as today.

## Migration Plan

Client only. Rollback is a client rollback. Titles saved with this change contain no new syntax.
