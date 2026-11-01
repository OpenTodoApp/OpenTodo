## 1. Step budget

- [x] 1.1 Raise the loop's step budget from 8 to 12 model calls (`MaxRounds`), keeping the change set only on `end_turn`; `TestLoopRoundLimit`
- [x] 1.2 System rules ask for few steps; regenerate `web/src/lib/assistantDevice/manifest.json` and `prompt.vectors.json` (`go test ./internal/assistant -run Device -update`)
- [x] 1.3 Spec delta: MODIFIED "Model response checks" and "The on-device loop and its tools" (12 model calls, inclusive limit), design D5, docs' `round_limit` line; `make openspec-validate`

## 2. Trigger

- [ ] 2.1 `lib/assistantSuggest.ts`: the device switch (`getSuggestAfterAdd`, `setSuggestAfterAdd`), the bounded prompt, `suggestAfterAdd` (does nothing unless the switch is on and the assistant is enabled, available and consented; never throws) and `createTaskThenSuggest`; `assistantSuggest.test.ts`
- [ ] 2.2 `TaskListView.onAdd`, `addFromBar` and `QuickAddSheet` create the task through `createTaskThenSuggest`

## 3. Setting

- [ ] 3.1 Settings → Integrations → Assistant: the "Suggest after adding" row and switch (this device); `settingsCopy` within the style limits; message catalogue and the five shipped translations (`make i18n-check`)

## 4. Docs

- [ ] 4.1 Assistant settings guide and CHANGELOG `### Added`; regenerate `web/src/generated/help.json` (`cd web && npm run docs:build`, `node scripts/docs/check.mjs`)
