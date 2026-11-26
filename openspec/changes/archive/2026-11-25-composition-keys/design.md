# Design

## Context

- `composingEnter(e)` in `web/src/lib/composeKey.ts` guards Enter in quick add, the task title, the notes line and the add lines (`natural-language-capture` "Composition is not a commit"). The `japanese` change (#2074) adds `composing(e)` beside it, true for any key while composing (`isComposing` on the event or its native event, or key code 229, which Safari reports for a composing key with `isComposing` false), and guards the comment composer with it.
- The shortcut dispatcher (`app/shortcuts/dispatch.ts`) and the overlay stack's Escape (`ui/overlay/stack.ts`) skip a key whose event has `isComposing`, but not one reported as key code 229. The keyboard-seen detector and a few fields (notes search, the assistant composers, the sidebar's inline rename) already skip composing keys.
- About fifty other keydown handlers on text fields act on Enter, Escape, Tab or the arrows without a check.

## Decisions

**D1. One guard, first in the handler.** A text field's keydown handler returns at once when `composing(e)` is true, before any key test; a handler that reports whether it took the key (`useTokenSuggest`, `useTickedSuggest`, the palette's row keys, the inline editor's `onKeyDownFirst`) returns `false`. A handler that stops propagation first (rename fields inside rows) keeps doing so, so a composing key still never reaches the row. Quick add keeps its `composingEnter` line, which also prevents the default of a composing Enter (its existing test), and adds the guard after it. Alternative: guard each key test (`e.key === 'Enter' && !composing(e)`). Used only for one-line handlers with a single key test; elsewhere one line at the top is easier to read and to keep.

**D2. The helper is `composing(e)` from `composeKey.ts`, with the `japanese` change's definition.** #2074 is queued to merge and defines it; this change writes the same file content and the same comment-composer guard, so whichever merges second merges cleanly. Alternative: a new `isComposing` helper in its own file. Rejected: two helpers for the same test.

**D3. A lint rule rather than a review checklist.** `web/eslint/composition-guard.js` (`input-method/composition-guard`, on `src/app` and `src/ui` outside tests and stories) checks every `onKeyDown` or `onKeyDownCapture` on an `<input>` that takes text, a `<textarea>`, `<Input>`, `<Textarea>` or a `contentEditable` element, and every function whose event parameter is typed `KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>` unless it is only attached to a non-text element (a range, a checkbox). A handler acts on a key when it compares `.key` with Enter, Escape, Tab, an arrow, Home or End (an equality, a `switch` or an `includes`), counting the same-file functions it calls. It passes when the handler calls `composing(...)`, reads `.isComposing` or compares `keyCode` with 229; `composingEnter(...)` is enough for a handler that acts on Enter alone. The rule also checks the `onKeyDown` of any element whose JSX renders one of those fields inside it (a form, a row, an editor panel), since the field's keys bubble to it. The guard has to come before the first key test, so a check such as `e.key === 'Enter' && !composing(e)` fails. A handler passed in from elsewhere is checked where it is written. The rule cannot see a field rendered by another component (a container around `<ProjectPickerField>`) or a handler built from a member call. Alternatives: a repo check over the source text (cannot follow a named handler), or a single `onKeyDown` wrapper component (every field would have to adopt it, and a new one could still skip it).

**D4. Elements around a field, and the global handlers.** Some elements around a text field act on the field's keys as they bubble. These get the guard: the command palette's capture handler, the routine description dialog, the new-label form, the save-view card, the default-reminder, reminder and password forms, the assistant's item editor, the single sign-on panel, the Today limit's custom field and the routine picker's inline text. The shortcut dispatcher and the overlay stack switch to `composing(e)`. Otherwise Safari's composing Escape (key code 229, `isComposing` false) would get past the field, which now returns early, and reach `list.escape` or close the top overlay. Rows, grids, menus and dialogs without a text field inside act on keys from buttons and links and keep their handlers. ProseMirror's own keymap already ignores keys during composition.

## Data model

None.

## Interface budget

No chrome, property, destination, scroll region or shortcut is added.

## Size

One line per handler and one helper call; no dependency. The first load stays within `web/bundle-budget.json`.
