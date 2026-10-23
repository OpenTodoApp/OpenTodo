## 1. The shell and the results

- [x] 1.1 `Dialog` `placement="palette"` (D4): top-anchored 40 rem card from 640 px without a visible title bar, the full-screen sheet below; verify `ui/overlay/dialog.test.tsx` and the Overlay story
- [x] 1.2 `ComboboxField` and `ComboboxList` `look="palette"` and `renderTrailing` (D5); `secondaryOf` without the shortcut; the shortcut as `KeySequence` keycaps; verify `ui/Combobox/Combobox.test.tsx` and `palette.test.tsx`
- [x] 1.3 The command bar in the new shell: the context chip, the footer with keys and prefixes and the Help link, the segmented control only on touch and below 640 px, `BarHint` removed, Escape from Add by opening mode (D6, D3); verify `commandBar.test.tsx`

## 2. Quick add

- [x] 2.1 `QuickAdd` `layout` prop (D1) and the token starter (D2): select a set row's words, start an unset row's token, open the suggestions for `#` and `@`; verify a unit test of the starter
- [x] 2.2 `FieldRows` (D2, D3): the rows, hints, keys, "Keep as text", the arrow highlight and Tab, the footer with the title and Shift+Enter add-and-open; Add mode uses it; verify `quickAddPalette.test.tsx`
- [x] 2.3 `SheetBar` (D7): neutral chips, dashed placeholders, the tool row and send; `QuickAddSheet` uses it; verify `quickAddSheet.test.tsx`
- [x] 2.4 Registry entries `palette.add-open` and `palette.fields` (local); verify the shortcut registry and conflict tests and `make docs-check` (keyboard guide)
- [x] 2.5 Strings in the five catalogs; verify `make i18n-check`

## 3. Docs, stories, baselines

- [x] 3.1 Stories: the quick-add palette with a parsed line and the phone sheet in `quickAdd.stories.tsx`; the command bar story in the new shell; verify `npm run build-storybook` through `make ui-check`
- [x] 3.2 Update `docs/quick-add.md` (or the guide page on quick add) and the search-and-commands guide, and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 3.3 Regenerate the visual baselines in the pinned Playwright image; verify `make ui-check` in CI
- [x] 3.4 Run `npm test` and `npm run build` in `web/`, `make check` with TZ=UTC, open the pull request and get CI green
