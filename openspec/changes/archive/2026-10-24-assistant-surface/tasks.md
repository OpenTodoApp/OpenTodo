## 1. The page and its parts

- [x] 1.1 The Assistant page (D1): `AssistantPage` in the assistant chunk, rendered by `AskScreen` when the assistant is available; History and New chat in the header; the foot composer once a conversation runs; Esc in a proposal discards it; verify `askEntry.test.tsx`
- [x] 1.2 The sheet yields to the page (D1): `AssistantRoot` closes an open request on `/ask` and focuses the page's composer, which takes the prefill; shared `useConversationReady`; verify `askEntry.test.tsx`
- [x] 1.3 Empty state (D2): `AssistantWelcome` with the brand mark, the greeting by the hour, the starters in the fixed order and the device-local hide; verify `assistantSurface.test.tsx`
- [x] 1.4 Composer on `ComposerFrame` (D3): the tray with the Skills menu and the context chip, Stop in the end slot, the round Send; the prefilled selection kept as state; verify `assistantSurface.test.tsx`, `assistantPanel.test.tsx`, `assistantSkills.test.tsx`
- [x] 1.5 Messages and the change-set card (D4): the bubble and the answer beside the mark; the card's head, rows, foot and the result row; verify `changeSetReview.test.tsx`, `fieldsReview.test.tsx`
- [x] 1.6 Names (D6): "Assistant" in the sidebar, the palette and the `go.ask` text; "New chat"; the layout script's ready heading

## 2. Strings, docs and stories

- [x] 2.1 Strings in the five catalogs, unused ones removed; verify `make i18n-check`
- [x] 2.2 Stories: `Screens/Assistant` (empty page, proposed changes, applied, empty sheet); the Ask screen stories' comment
- [x] 2.3 Update `docs/assistant.md`, `docs/assistant-ask.md`, `docs/assistant-skills.md` and the keyboard table, rebuild `help.json`, add the CHANGELOG entry under Unreleased → Changed and the change name to the ROADMAP row; verify `make docs-check`
- [x] 2.4 Measure the bundle on this branch and its base and record it in design.md (D5)

## 3. Baselines and CI

- [x] 3.1 Regenerate the visual baselines with the "UI baselines" workflow; verify `make ui-check` in CI
- [x] 3.2 Run the web suite, `npm run build`, open the pull request and get CI green
