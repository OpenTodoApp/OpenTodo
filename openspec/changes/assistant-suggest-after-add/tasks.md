## 1. Trigger

- [x] 1.1 `lib/assistantSuggest.ts`: the device switch (`getSuggestAfterAdd`, `setSuggestAfterAdd`), the bounded prompt, `suggestAfterAdd` (does nothing unless the switch is on and the assistant is enabled, available and consented; never throws) and `createTaskThenSuggest`; `assistantSuggest.test.ts`
- [x] 1.2 `TaskListView.onAdd`, `addFromBar` and `QuickAddSheet` create the task through `createTaskThenSuggest`

## 2. Setting

- [x] 2.1 Settings → Integrations → Assistant: the "Suggest after adding" row and switch (this device); `settingsCopy` within the style limits; message catalogue and the five shipped translations (`make i18n-check`)

## 3. Docs

- [x] 3.1 Assistant settings guide and CHANGELOG `### Added`

## 4. Step budget

- [x] 4.1 Raise the loop's step budget from 8 to 12 model calls (`MaxRounds`), keeping the change set only on `end_turn`; `TestLoopRoundLimit` and `TestLoopStopsAtRoundLimitOnLastRound`
- [x] 4.2 Spec delta: MODIFIED "The agent loop and its step budget" (reaches 12 model calls, inclusive limit), design D5, docs' `round_limit` line; `make openspec-validate`
