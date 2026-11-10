# Tasks

## 1. Reads

- [x] 1.1 Sections in `list_projects` and `opentodo://projects`, on the server and the device. Verify with `TestListProjectsCarriesSections` and `labelMatch.test.ts`; run `go test ./...` and `npm test`.
- [x] 1.2 Label matching for `search_tasks` (the narrowed snapshot included) and `list_tasks`' `label`, on the server and the device, with `labelMatch.vectors.json`. Verify with `TestLabelMatchVectors`, `TestSearchAndFilterFindPluralLabels` and `labelMatch.test.ts`.

## 2. Answers

- [x] 2.1 Rounds' text on a new paragraph, the one-task refusal and follow-ups that ask for words, on the server and the device, with `blocks.vectors.json` and the manifest. Verify with `evalgaps_test.go`, `blocks.test.ts`, `loop.test.ts` and `labelMatch.test.ts`.
- [x] 2.2 Instructions. Verify with `TestInstructionsAskForWords` and `prompt.vectors.json`.

## 3. Eval

- [x] 3.1 `scripts/fake-llm.mjs` takes the failing scenarios' paths, and `board-column`, `errands-map`, `complaint-no-repeat` and `one-task-link` run with `ASSISTANT_EVAL_FAKE=1`. Verify with `ASSISTANT_EVAL_FAKE=1 node scripts/assistant-eval/run.mjs` (9 of 9 pass).
- [ ] 3.2 The next real eval run passes `board-column`, `errands-map`, `complaint-no-repeat` and `one-task-link`. Verify with `make assistant-eval` against a provider, recorded here.
