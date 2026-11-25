# Proposal

## Why

Issue #2081: with a Japanese or Chinese input method, Enter confirms the converted text, Escape cancels the reading, and Tab or the arrows pick a candidate. Quick add, a task title and the comment composer already let Enter belong to the input method (`natural-language-capture` "Composition is not a commit"), but most other text fields act on the key anyway: renaming a section or a project saves the unconverted reading, Escape while composing cancels the whole rename, ↓ in a search field jumps to the results, and a suggestion list picks its highlighted item on the Enter that only meant to confirm a character.

## What Changes

- **Every text field waits for the input method.** While an input method is composing, a text field's own Enter, Escape, Tab, arrow, Home and End handling does nothing: no save, no cancel, no pick, no move. The keys belong to the input method; once composition has ended they act as the field already specifies. This covers every input, textarea and editable region in the web app, the suggestion lists and pickers that read keys from a field, and the command palette.
- **A lint rule keeps it so.** `input-method/composition-guard` (a local ESLint rule in `web/eslint/`) fails a text field's keydown handler that acts on one of those keys without returning first while composing. The guard is `composing(e)` from `web/src/lib/composeKey.ts`, the helper the `japanese` change (#2074) introduces with the same definition.
- No op field, route, setting, dependency or shortcut changes. Nothing is stored. Not **BREAKING**.

Out of scope: the rich-text note and description editor (ProseMirror handles composition itself), the shortcut dispatcher (it already ignores composing keys), the native shells, and keys that only a field outside the web app sees.

ROADMAP.md: none (a fix from an issue).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `keyboard-shortcuts`: a new requirement, "Keys in a text field wait for the input method".

## Impact

- Web: the keydown handlers of the text fields in `web/src/app` and `web/src/ui` (renames, search and find fields, date, time, estimate and recurrence fields, suggestion lists, `useCombobox`, the command palette's capture handler, the line date picker's Escape); `web/src/lib/composeKey.ts` gains `composing(e)`; `web/eslint/composition-guard.js` and `web/eslint.config.js`.
- Tests: the rule in `web/scripts/eslint-config.test.mjs`; composing keys in the project header rename, the combobox and the inline title editor.
- Size: a few bytes per handler; the first load stays within `web/bundle-budget.json`.
