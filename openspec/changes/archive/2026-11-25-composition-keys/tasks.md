# Tasks

## 1. The guard

- [x] 1.1 `composing(e)` in `web/src/lib/composeKey.ts`, with the definition of the `japanese` change (#2074), and `composingEnter` built on it. Verify: the existing composing-Enter tests in `quickAdd.test.tsx` and `titleField.test.tsx` pass.
- [x] 1.2 Every text field's keydown handler in `web/src/app` and `web/src/ui` that acts on Enter, Escape, Tab, an arrow, Home or End returns first while composing (D1), including `useCombobox`, `useTokenSuggest`, `useTickedSuggest`, the line date picker's Escape and the command palette's capture handler. Verify: `projectHeader.test.tsx`, `Combobox.test.tsx` and `task-list/inlineEditor.test.tsx` press composing keys; `npm test` in web/.
- [x] 1.3 The forms, editors and panels around a field that act on its Enter or Escape return first while composing, and the shortcut dispatcher and the overlay stack use `composing(e)` (D4). Verify: `compositionKeys.test.tsx` (the new-label form, the assistant's item editor), `shortcuts/dispatch.test.ts` and `ui/overlay/composingEscape.test.ts` press a composing Escape with `isComposing` and with key code 229.

## 2. The rule

- [x] 2.1 `web/eslint/composition-guard.js` registered as `input-method/composition-guard` in `web/eslint.config.js` (D3). Verify: cases in `web/scripts/eslint-config.test.mjs` (inline, named, called and typed handlers, an element around a field and a guard after the key test refused; the guard, `composingEnter` for Enter alone, a range, a checkbox and a button accepted); `npm run lint` in web/ passes with no suppression.

## 3. Docs and checks

- [x] 3.1 `changelog.d/Fixed/composition-keys.md`. Verify: `make docs`, `make docs-check` and `make repo-check`.
- [x] 3.2 Typecheck, lint with knip, `make ui-lint`, `make i18n-check` and `make openspec-validate`.
